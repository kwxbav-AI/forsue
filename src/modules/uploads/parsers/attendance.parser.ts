import { parseISO, isValid, parse } from "date-fns";
import Decimal from "decimal.js";
import { parseExcelBuffer, getCell, validateRequiredColumns } from "./base.parser";
import {
  ATTENDANCE_COLUMNS,
  buildHeaderMap,
  type ColumnMapping,
} from "../column-mapping";
import type { ParseResult, ParseError } from "../types";
import { toDecimal } from "@/lib/number";

/** 解析「X時Y分」或「X時」為小數工時，例如 9時54分 -> 9.9 */
function parseWorkHours(value: unknown): Decimal | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;

  const matchHM = s.match(/^(\d+)\s*時\s*(\d+)\s*分$/);
  if (matchHM) {
    const h = parseInt(matchHM[1], 10);
    const m = parseInt(matchHM[2], 10);
    return new Decimal(h).plus(new Decimal(m).div(60));
  }
  const matchH = s.match(/^(\d+)\s*時$/);
  if (matchH) return new Decimal(matchH[1]);

  const normalized = s.replace(/小時|hr|h|時|分/g, "").replace(/,/g, "").trim();
  const d = toDecimal(normalized || s);
  return d !== null && !d.lt(0) ? d : null;
}

/** 解析「HH:mm」或「HH:mm:ss」，回傳分鐘數 */
function parseTimeToMinutes(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(min) || Number.isNaN(sec)) return null;
  return h * 60 + min + sec / 60;
}

/** 若工時空白但有上/下班時間，改用時間差計算工時 */
function computeWorkHoursFromTimes(startTime: string | null, endTime: string | null): Decimal | null {
  if (!startTime || !endTime) return null;
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin == null || endMin == null) return null;
  const diff = endMin - startMin;
  if (diff <= 0) return null;
  return new Decimal(diff).div(60);
}

export interface AttendanceRow {
  workDate: Date;
  employeeCode: string;
  employeeName?: string;
  storeCode: string | null;
  department: string | null;
  workHours: Decimal;
  scheduledWorkHours: Decimal | null;
  startTime: string | null;
  endTime: string | null;
  clockInInfoRaw: string | null;
  clockOutInfoRaw: string | null;
  shiftType: string | null;
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

/** 從「日期(星期)」格式拆出日期與星期，例如 "2026-03-05(四)" -> { dateStr: "2026-03-05", weekday: "四" } */
function splitDateWeekday(value: string): { dateStr: string; weekday: string | null } {
  const m = value.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (m) return { dateStr: m[1].trim(), weekday: m[2].trim() || null };
  return { dateStr: value.trim(), weekday: null };
}

/** 支援 日期(星期)、ISO、yyyy/mm/dd、Excel 序號、Date 物件、yyyyMMdd、年月日 等格式 */
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
      const parsed = parse(s, fmt, new Date());
      if (isValid(parsed)) return parsed;
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

export function parseAttendanceSheet(buffer: Buffer): ParseResult<AttendanceRow> {
  const rows = parseExcelBuffer(buffer);
  if (rows.length < 2) {
    return { data: [], errors: [{ row: 0, message: "檔案至少需有表頭與一筆資料" }] };
  }

  const required = ["workDate", "employeeCode", "workHours"];
  const headerRowIndex = findHeaderRow(rows, ATTENDANCE_COLUMNS as ColumnMapping, required);
  const headerMap = buildHeaderMap(rows[headerRowIndex] as unknown[], ATTENDANCE_COLUMNS as ColumnMapping);
  const columnErrors = validateRequiredColumns(
    headerMap,
    required,
    ATTENDANCE_COLUMNS as ColumnMapping
  );
  if (columnErrors.length > 0) return { data: [], errors: columnErrors };

  const data: AttendanceRow[] = [];
  const errors: ParseError[] = [];
  const dataStartIndex = headerRowIndex + 1;

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const workDateRaw = headerMap.workDate !== undefined ? row[headerMap.workDate] : undefined;
    const workDateStr = workDateRaw != null ? String(workDateRaw).trim() : getCell(row, headerMap.workDate);
    const employeeCode = getCell(row, headerMap.employeeCode);
    const workHoursStr = getCell(row, headerMap.workHours);
    const scheduledWorkHoursStr =
      headerMap.scheduledWorkHours !== undefined ? getCell(row, headerMap.scheduledWorkHours) : "";
    const startTimeStr =
      headerMap.startTime !== undefined ? getCell(row, headerMap.startTime) || "" : "";
    const endTimeStr =
      headerMap.endTime !== undefined ? getCell(row, headerMap.endTime) || "" : "";
    const clockInInfoRaw =
      headerMap.clockInInfo !== undefined ? getCell(row, headerMap.clockInInfo) || "" : "";
    const clockOutInfoRaw =
      headerMap.clockOutInfo !== undefined ? getCell(row, headerMap.clockOutInfo) || "" : "";

    const workDate = parseDate(workDateRaw ?? workDateStr);
    if (!workDate) {
      const rawPreview = workDateRaw != null ? String(workDateRaw).slice(0, 30) : "(空白)";
      errors.push({
        row: i + 1,
        field: "workDate",
        message: `工作日期格式錯誤或空白 (收到的值: ${rawPreview})`,
      });
      continue;
    }

    if (!employeeCode) {
      errors.push({ row: i + 1, field: "employeeCode", message: "員工代碼不可空白" });
      continue;
    }

    let workHours = parseWorkHours(workHoursStr);
    const scheduledWorkHours = parseWorkHours(scheduledWorkHoursStr);

    // 若工時欄位為空白且有上/下班時間，優先用時間差計算工時
    const workHoursRaw = (workHoursStr != null ? String(workHoursStr) : "").trim();
    if ((workHours === null || workHours.lt(0)) && !workHoursRaw && startTimeStr && endTimeStr) {
      const fromTimes = computeWorkHoursFromTimes(startTimeStr, endTimeStr);
      if (fromTimes !== null && !fromTimes.lt(0)) {
        workHours = fromTimes;
      }
    }

    if (workHours === null || workHours.lt(0)) {
      const rawPreview = workHoursRaw.slice(0, 30);
      if (!rawPreview) {
        workHours = new Decimal(0);
      } else {
        errors.push({
          row: i + 1,
          field: "workHours",
          message: `工時必須為有效非負數值 (收到的值: ${rawPreview})`,
        });
        continue;
      }
    }

    const storeCode = headerMap.storeCode !== undefined ? getCell(row, headerMap.storeCode) || null : null;
    const department =
      headerMap.department !== undefined ? getCell(row, headerMap.department) || null : null;
    const employeeName = headerMap.employeeName !== undefined ? getCell(row, headerMap.employeeName) || "" : "";
    const shiftType = headerMap.shiftType !== undefined ? getCell(row, headerMap.shiftType) || null : null;

    data.push({
      workDate,
      employeeCode,
      employeeName: employeeName || undefined,
      storeCode: storeCode || null,
      department: department || null,
      workHours,
      scheduledWorkHours,
      startTime: startTimeStr || null,
      endTime: endTimeStr || null,
      clockInInfoRaw: clockInInfoRaw.trim() ? clockInInfoRaw.trim() : null,
      clockOutInfoRaw: clockOutInfoRaw.trim() ? clockOutInfoRaw.trim() : null,
      shiftType: shiftType || null,
    } as AttendanceRow);
  }

  return { data, errors };
}
