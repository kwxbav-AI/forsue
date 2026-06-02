import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import { isValid, parse, parseISO } from "date-fns";
import { parseDateOnlyUTC, formatDateOnlyTaipei } from "@/lib/date";
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
/** 員工列：T2505450-姓名 或 Y2211263-姓名（班表匯出常見格式） */
const EMP_ROW_RE = /^([A-Z]\d+)[-－](.+)$/i;
/** 例：A-09:00-18:00、班A09:00-18:00 */
const SHIFT_TIME_RE = /^[A-Z]{0,4}-?(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/i;
/** 例：09:00-18:00（無班別代碼前綴） */
const SHIFT_PLAIN_TIME_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

const DATE_FORMATS = ["yyyy/M/d", "yyyy/MM/dd", "yyyy-M-d", "yyyy-MM-dd"];

/** 表頭日期格 → YYYY-MM-DD（台北日曆日，與上傳 toWorkDateUTC 一致） */
function parseYmdCell(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return isValid(v) ? formatDateOnlyTaipei(v) : null;
  }

  let s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return null;

  const weekdayStrip = s.match(/^(.+?)\s*\([^)]*\)\s*$/);
  if (weekdayStrip) s = weekdayStrip[1].trim();

  if (DATE_YMD_RE.test(s)) return s;

  const num = Number(s);
  if (!Number.isNaN(num) && num > 0 && num < 300000) {
    const d = new Date(1900, 0, 1);
    d.setDate(d.getDate() + (num - 1));
    if (isValid(d)) return formatDateOnlyTaipei(d);
  }

  const rocMatch = s.match(/^(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    const year = rocYear < 200 ? 1911 + rocYear : rocYear;
    const month = parseInt(rocMatch[2], 10);
    const day = parseInt(rocMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  const normalized = s.replace(/\//g, "-");
  let d = parseISO(normalized);
  if (isValid(d)) return formatDateOnlyTaipei(d);
  d = parseISO(s);
  if (isValid(d)) return formatDateOnlyTaipei(d);

  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parse(s, fmt, new Date());
      if (isValid(parsed)) return formatDateOnlyTaipei(parsed);
    } catch {
      continue;
    }
  }

  return null;
}

function parseEmployeeCell(v: unknown): {
  employeeCode: string;
  employeeName: string;
  positionLabel: string | null;
} | null {
  const s = cellStr(v);
  const m = EMP_ROW_RE.exec(s);
  if (!m) return null;
  const employeeCode = m[1].trim().toUpperCase();
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

  if (/休息日|例假日|國定假日|休假|請假|空班日/.test(s)) {
    const kind = s.includes("國定") ? "HOLIDAY" : s.includes("假") ? "LEAVE" : "OFF";
    return {
      shiftKind: kind as ShiftRosterRow["shiftKind"],
      startTime: null,
      endTime: null,
      scheduledHours: new Decimal(0),
    };
  }

  const m = SHIFT_TIME_RE.exec(s) ?? SHIFT_PLAIN_TIME_RE.exec(s);
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

  // 班表匯出檔名常見差異：空白、底線、破折號、括號註記等。
  // 例如：「中正-南」「中正 南」「中正南(6月)」都應辨識為「中正南」。
  const normalizeLoose = (s: string): string =>
    normalizeStoreKey(s)
      .replace(/[\s_]+/g, "")
      .replace(/[－–—-]+/g, "")
      .replace(/[（）()【】\[\]{}]/g, "")
      .trim();

  const baseLoose = normalizeLoose(base);
  let best: string | null = null;
  let bestLen = -1;

  for (const { storeNames } of OPS_REGION_CATALOG) {
    for (const name of storeNames) {
      const nameLoose = normalizeLoose(name);
      if (!nameLoose) continue;
      if (baseLoose.includes(nameLoose) && nameLoose.length > bestLen) {
        best = name;
        bestLen = nameLoose.length;
      }
    }
  }
  if (best) return best;
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

function rowHasContent(row: unknown[]): boolean {
  return row.some((c) => cellStr(c) !== "");
}

/** 截斷 xls 常見的 65536 列空白，並在「班別」彙總區塊前停止 */
function trimSheetRows(rows: unknown[][]): unknown[][] {
  let lastIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (!rowHasContent(row)) continue;
    const label = cellStr(row[1]);
    if (label === "班別" && cellStr(row[0]) === "") break;
    lastIdx = i;
  }
  return lastIdx >= 0 ? rows.slice(0, lastIdx + 1) : rows.slice(0, 0);
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
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
  return trimSheetRows(raw);
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
        if (cellStr(empRow[1]) === "班別") {
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
