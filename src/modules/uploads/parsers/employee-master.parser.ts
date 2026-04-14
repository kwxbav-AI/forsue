import * as XLSX from "xlsx";
import { skipEmptyRows } from "@/lib/excel";
import { getCell, validateRequiredColumns } from "./base.parser";
import {
  EMPLOYEE_MASTER_COLUMNS,
  buildHeaderMap,
  type ColumnMapping,
} from "../column-mapping";
import type { ParseResult, ParseError } from "../types";
import { parseISO, isValid, parse } from "date-fns";

export interface EmployeeMasterRow {
  employeeCode: string;
  name: string;
  storeCode: string | null;
  position: string | null;
  hireDate: Date | null;
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

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  let s = String(value).trim().replace(/\s+/g, " ");
  if (!s) return null;

  const num = Number(s);
  if (!Number.isNaN(num) && num > 0 && num < 300000) {
    const d = new Date(1900, 0, 1);
    d.setDate(d.getDate() + (num - 1));
    if (isValid(d)) return d;
  }

  const rocMatch = s.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    const year = rocYear < 200 ? 1911 + rocYear : rocYear;
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
    try {
      const parsedD = parse(s, fmt, new Date());
      if (isValid(parsedD)) return parsedD;
    } catch {
      continue;
    }
  }
  return null;
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

export function parseEmployeeMasterSheet(buffer: Buffer): ParseResult<EmployeeMasterRow> {
  const required = ["employeeCode", "name"];
  const sheets = readAllSheets(buffer);
  const picked = pickBestSheet(sheets, EMPLOYEE_MASTER_COLUMNS as ColumnMapping, required);
  const rows = picked.rows;
  if (rows.length < 2) {
    return { data: [], errors: [{ row: 0, message: "檔案至少需有表頭與一筆資料" }] };
  }

  const headerRowIndex = findHeaderRow(rows, EMPLOYEE_MASTER_COLUMNS as ColumnMapping, required);
  const headerMap = buildHeaderMap(rows[headerRowIndex] as unknown[], EMPLOYEE_MASTER_COLUMNS as ColumnMapping);
  const columnErrors = validateRequiredColumns(
    headerMap,
    required,
    EMPLOYEE_MASTER_COLUMNS as ColumnMapping
  );
  if (columnErrors.length > 0) return { data: [], errors: columnErrors };

  const data: EmployeeMasterRow[] = [];
  const errors: ParseError[] = [];
  const dataStartIndex = headerRowIndex + 1;

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const employeeCode = getCell(row, headerMap.employeeCode);
    const name = getCell(row, headerMap.name);

    if (!employeeCode) {
      errors.push({ row: i + 1, field: "employeeCode", message: "員工代碼不可空白" });
      continue;
    }
    if (!name) {
      errors.push({ row: i + 1, field: "name", message: "姓名不可空白" });
      continue;
    }

    const storeCode = headerMap.storeCode !== undefined ? getCell(row, headerMap.storeCode) || null : null;
    const position = headerMap.position !== undefined ? getCell(row, headerMap.position) || null : null;
    const hireDateRaw = headerMap.hireDate !== undefined ? (row[headerMap.hireDate] as any) : null;
    const hireDateCell = headerMap.hireDate !== undefined ? getCell(row, headerMap.hireDate) : "";
    const hireDate = headerMap.hireDate !== undefined ? parseDate(hireDateRaw ?? hireDateCell) : null;

    data.push({
      employeeCode,
      name,
      storeCode: storeCode || null,
      position: position || null,
      hireDate,
    });
  }

  return { data, errors };
}
