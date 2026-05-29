import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import { parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import {
  OPS_REGION_CATALOG,
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";
import type { ParseError } from "../types";

export type ShiftRosterRow = {
  workDate: Date;
  employeeCode: string;
  employeeName: string;
  positionLabel: string | null;
  shiftKind: "WORK" | "OFF" | "HOLIDAY" | "LEAVE" | "UNKNOWN";
  startTime: string | null;
  endTime: string | null;
  scheduledHours: Decimal;
  rawCell: string;
};

export type ShiftRosterParseResult = {
  storeCatalogKey: string | null;
  data: ShiftRosterRow[];
  errors: ParseError[];
};

const DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMP_ROW_RE = /^T(\d+)[-－](.+)$/;
const SHIFT_TIME_RE = /^[A-Z]{1,4}-(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/i;

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return formatDateOnly(v);
  return String(v).trim();
}

function parseYmdCell(v: unknown): string | null {
  const s = cellStr(v);
  if (!DATE_YMD_RE.test(s)) return null;
  return s;
}

function parseEmployeeCell(v: unknown): {
  employeeCode: string;
  employeeName: string;
  positionLabel: string | null;
} | null {
  const s = cellStr(v);
  const m = EMP_ROW_RE.exec(s);
  if (!m) return null;
  const employeeCode = `T${m[1].trim()}`;
  const rest = m[2].trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  const employeeName = parts[0] ?? rest;
  const positionLabel = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { employeeCode, employeeName, positionLabel };
}

function hoursFromTimes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.round((endMin - startMin) / 60 * 100) / 100;
}

function parseShiftCell(raw: string): {
  shiftKind: ShiftRosterRow["shiftKind"];
  startTime: string | null;
  endTime: string | null;
  scheduledHours: Decimal;
} {
  const s = raw.trim();
  if (!s) {
    return {
      shiftKind: "UNKNOWN",
      startTime: null,
      endTime: null,
      scheduledHours: new Decimal(0),
    };
  }

  if (/休息日|例假日|國定假日|休假|請假/.test(s)) {
    const kind = s.includes("國定") ? "HOLIDAY" : s.includes("假") ? "LEAVE" : "OFF";
    return {
      shiftKind: kind as ShiftRosterRow["shiftKind"],
      startTime: null,
      endTime: null,
      scheduledHours: new Decimal(0),
    };
  }

  const m = SHIFT_TIME_RE.exec(s);
  if (m) {
    const startTime = `${m[1].padStart(2, "0")}:${m[2]}`;
    const endTime = `${m[3].padStart(2, "0")}:${m[4]}`;
    const h = hoursFromTimes(startTime, endTime);
    return {
      shiftKind: "WORK",
      startTime,
      endTime,
      scheduledHours: new Decimal(h),
    };
  }

  return {
    shiftKind: "UNKNOWN",
    startTime: null,
    endTime: null,
    scheduledHours: new Decimal(0),
  };
}

/** 從檔名解析 catalog 門市簡稱（如 昆明、大竹） */
export function resolveStoreCatalogKeyFromFilename(filename: string): string | null {
  const base = filename.replace(/\.(xls|xlsx)$/i, "");
  for (const { storeNames } of OPS_REGION_CATALOG) {
    for (const name of storeNames) {
      if (base.includes(name)) return name;
    }
  }
  const m = base.match(/上([^上]+)店/);
  if (m) {
    const key = normalizeStoreKey(m[1]);
    for (const { storeNames } of OPS_REGION_CATALOG) {
      if (storeNames.some((n) => n === key || storeNameMatchesCatalogKey(n, key))) {
        return storeNames.find((n) => n === key || storeNameMatchesCatalogKey(n, key)) ?? key;
      }
    }
  }
  return null;
}

function readSheetRows(buffer: Buffer, sheetName?: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const name =
    sheetName && workbook.SheetNames.includes(sheetName)
      ? sheetName
      : workbook.SheetNames.includes("班表")
        ? "班表"
        : workbook.SheetNames[0];
  if (!name) throw new Error("Excel 檔案沒有工作表");
  const sheet = workbook.Sheets[name];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
}

function isWeekdayHeaderRow(row: unknown[]): boolean {
  const c1 = cellStr(row[1]);
  return (
    c1 === "星期一" ||
    c1 === "週一" ||
    c1 === "星期日" ||
    c1 === "週日" ||
    c1 === "星期天"
  );
}

function isDateHeaderRow(row: unknown[]): Map<number, string> | null {
  const dates = new Map<number, string>();
  for (let col = 1; col < row.length; col++) {
    const ymd = parseYmdCell(row[col]);
    if (ymd) dates.set(col, ymd);
  }
  return dates.size >= 1 ? dates : null;
}

export function parseShiftRosterSheet(
  buffer: Buffer,
  filename: string
): ShiftRosterParseResult {
  const errors: ParseError[] = [];
  const storeCatalogKey = resolveStoreCatalogKeyFromFilename(filename);
  if (!storeCatalogKey) {
    errors.push({
      row: 0,
      message: `無法從檔名辨識門市（請含 catalog 簡稱，如：昆明、大竹）: ${filename}`,
    });
  }

  let rows: unknown[][];
  try {
    rows = readSheetRows(buffer);
  } catch (e) {
    return {
      storeCatalogKey,
      data: [],
      errors: [{ row: 0, message: e instanceof Error ? e.message : "無法讀取 Excel" }],
    };
  }

  const data: ShiftRosterRow[] = [];
  let consecutiveBlank = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNum = i + 1;

    const dateCols = isDateHeaderRow(row);
    if (dateCols) {
      consecutiveBlank = 0;
      for (let j = i + 1; j < rows.length; j++) {
        const empRow = rows[j] ?? [];
        const empRowNum = j + 1;

        if (isWeekdayHeaderRow(empRow) && cellStr(empRow[0]) === "") {
          break;
        }

        const emp = parseEmployeeCell(empRow[0]);
        if (!emp) {
          const first = cellStr(empRow[0]);
          if (!first) {
            consecutiveBlank += 1;
            if (consecutiveBlank >= 20) break;
            continue;
          }
          consecutiveBlank = 0;
          continue;
        }
        consecutiveBlank = 0;

        for (const [col, ymd] of dateCols) {
          const raw = cellStr(empRow[col]);
          if (!raw) continue;

          const parsed = parseShiftCell(raw);
          if (parsed.shiftKind === "UNKNOWN" && parsed.scheduledHours.eq(0)) {
            errors.push({
              row: empRowNum,
              field: `col${col}`,
              message: `無法解析班別「${raw}」（${ymd} ${emp.employeeCode}）`,
            });
            continue;
          }

          if (parsed.shiftKind !== "WORK") continue;

          data.push({
            workDate: parseDateOnlyUTC(ymd),
            employeeCode: emp.employeeCode,
            employeeName: emp.employeeName,
            positionLabel: emp.positionLabel,
            shiftKind: parsed.shiftKind,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            scheduledHours: parsed.scheduledHours,
            rawCell: raw,
          });
        }
      }
      continue;
    }
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: "未解析到任何排班資料，請確認為矩陣式班表格式" });
  }

  return { storeCatalogKey, data, errors };
}
