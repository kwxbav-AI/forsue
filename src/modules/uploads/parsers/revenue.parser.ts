import { parseISO, isValid, parse } from "date-fns";
import Decimal from "decimal.js";
import * as XLSX from "xlsx";
import { skipEmptyRows } from "@/lib/excel";
import { getCell, validateRequiredColumns } from "./base.parser";
import {
  REVENUE_COLUMNS,
  buildHeaderMap,
  type ColumnMapping,
} from "../column-mapping";
import type { ParseResult, ParseError } from "../types";
import { toDecimal } from "@/lib/number";

export interface RevenueRow {
  revenueDate: Date;
  storeCode: string;
  checkoutNo: string | null;
  revenueAmount: Decimal;
  cashIncome: Decimal;
  linePayAmount: Decimal;
  expenseAmount: Decimal;
}

const DATE_FORMATS = [
  "yyyy/M/d",
  "yyyy/MM/dd",
  "yyyy-M-d",
  "yyyy-MM-dd",
  "M/d/yyyy",
  "d/M/yyyy",
  "yyyy年M月d日",
  "yyyy年MM月dd日",
  "yyyyMMdd",
];

function splitDateWeekday(value: string): { dateStr: string; weekday: string | null } {
  const m = value.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (m) return { dateStr: m[1].trim(), weekday: m[2].trim() || null };
  return { dateStr: value.trim(), weekday: null };
}

/** 支援 日期(星期)、ISO、yyyy/MM/dd、Excel 序號、Date 物件、yyyyMMdd、民國年 等格式 */
function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  let s = String(value).trim().replace(/\s+/g, " ");
  if (!s) return null;

  const { dateStr } = splitDateWeekday(s);
  s = dateStr || s;

  const num = Number(s);
  if (!Number.isNaN(num) && num > 0 && num < 300000) {
    const d = new Date(1900, 0, 1);
    d.setDate(d.getDate() + (num - 1));
    if (isValid(d)) return d;
  }

  // 民國年：115.03.04 / 115/03/04 / 115-03-04
  const rocMatch = s.match(/^(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    const year = rocYear < 300 ? 1911 + rocYear : rocYear;
    const month = parseInt(rocMatch[2], 10) - 1;
    const day = parseInt(rocMatch[3], 10);
    const d = new Date(year, month, day);
    if (isValid(d)) return d;
  }

  if (/^\d{8}$/.test(s)) {
    const d = parseISO(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    if (isValid(d)) return d;
  }

  const normalized = s.replace(/\//g, "-");
  let d = parseISO(normalized);
  if (isValid(d)) return d;
  d = parseISO(s);
  if (isValid(d)) return d;

  for (const fmt of DATE_FORMATS) {
    const parsedDate = parse(s, fmt, new Date());
    if (isValid(parsedDate)) return parsedDate;
  }
  return null;
}

function parseRevenueAmount(value: unknown): Decimal | null {
  if (value == null || value === "") return new Decimal(0);
  const s = String(value).trim();
  if (!s) return new Decimal(0);
  const normalized = s.replace(/,/g, "").replace(/元|\$/g, "").trim();
  const d = toDecimal(normalized || s);
  if (d === null) return null;
  return d.lt(0) ? null : d;
}

function findHeaderRow(rows: unknown[][], columnDef: ColumnMapping, required: string[]): number {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const headerMap = buildHeaderMap(rows[r] as unknown[], columnDef);
    const allFound = required.every((k) => headerMap[k] !== undefined);
    if (allFound) return r;
  }
  return 0;
}

function readAllSheets(buffer: Buffer): { sheetName: string; rows: unknown[][] }[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown as unknown[][];
    return { sheetName, rows: skipEmptyRows(rows) };
  });
}

function pickBestSheet(
  sheets: { sheetName: string; rows: unknown[][] }[],
  columnDef: ColumnMapping,
  required: string[]
): { sheetName: string; rows: unknown[][] } {
  for (const s of sheets) {
    const headerRowIndex = findHeaderRow(s.rows, columnDef, required);
    const headerMap = buildHeaderMap(s.rows[headerRowIndex] ?? [], columnDef);
    const ok = required.every((k) => headerMap[k] !== undefined);
    if (ok) return s;
  }
  return sheets[0] ?? { sheetName: "Sheet1", rows: [] };
}

export function parseRevenueSheet(buffer: Buffer): ParseResult<RevenueRow> {
  const required = ["revenueDate", "storeCode", "revenueAmount"];
  const sheets = readAllSheets(buffer);
  const picked = pickBestSheet(sheets, REVENUE_COLUMNS as ColumnMapping, required);
  const rows = picked.rows;
  if (rows.length < 2) {
    return { data: [], errors: [{ row: 0, message: "檔案至少需有表頭與一筆資料" }] };
  }

  const headerRowIndex = findHeaderRow(rows, REVENUE_COLUMNS as ColumnMapping, required);
  const headerMap = buildHeaderMap(rows[headerRowIndex], REVENUE_COLUMNS as ColumnMapping);
  const columnErrors = validateRequiredColumns(
    headerMap,
    required,
    REVENUE_COLUMNS as ColumnMapping
  );
  if (columnErrors.length > 0) return { data: [], errors: columnErrors };

  const data: RevenueRow[] = [];
  const errors: ParseError[] = [];

  const dataStartIndex = headerRowIndex + 1;
  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const revenueDateRaw = headerMap.revenueDate !== undefined ? row[headerMap.revenueDate] : undefined;
    const revenueDateStr = getCell(row, headerMap.revenueDate);
    const storeCode = getCell(row, headerMap.storeCode);
    const checkoutNo =
      headerMap.checkoutNo !== undefined ? getCell(row, headerMap.checkoutNo) || "" : "";
    const revenueAmountStr = getCell(row, headerMap.revenueAmount);
    const cashIncomeStr =
      headerMap.cashIncome !== undefined ? getCell(row, headerMap.cashIncome) : "";
    const linePayAmountStr =
      headerMap.linePayAmount !== undefined ? getCell(row, headerMap.linePayAmount) : "";
    const expenseAmountStr =
      headerMap.expenseAmount !== undefined ? getCell(row, headerMap.expenseAmount) : "";

    const revenueDate = parseDate(revenueDateRaw ?? revenueDateStr);
    if (!revenueDate) {
      const rawPreview = revenueDateRaw != null ? String(revenueDateRaw).slice(0, 30) : "(空白)";
      errors.push({
        row: i + 1,
        field: "revenueDate",
        message: `營收日期格式錯誤或空白 (收到的值: ${rawPreview})`,
      });
      continue;
    }
    if (!storeCode) {
      errors.push({ row: i + 1, field: "storeCode", message: "門市代碼不可空白" });
      continue;
    }

    const revenueAmount = parseRevenueAmount(revenueAmountStr);
    if (revenueAmount === null || revenueAmount.lt(0)) {
      const rawPreview = (revenueAmountStr != null ? String(revenueAmountStr) : "").slice(0, 30);
      errors.push({
        row: i + 1,
        field: "revenueAmount",
        message: `營收金額必須為有效非負數值 (收到的值: ${rawPreview || "(空白)"})`,
      });
      continue;
    }

    const cashIncome = parseRevenueAmount(cashIncomeStr) ?? new Decimal(0);
    const linePayAmount = parseRevenueAmount(linePayAmountStr) ?? new Decimal(0);
    const expenseAmount = parseRevenueAmount(expenseAmountStr) ?? new Decimal(0);

    data.push({
      revenueDate,
      storeCode,
      checkoutNo: checkoutNo.trim() ? checkoutNo.trim() : null,
      revenueAmount,
      cashIncome,
      linePayAmount,
      expenseAmount,
    });
  }

  return { data, errors };
}
