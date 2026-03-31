import { startOfDay, parseISO, isValid } from "date-fns";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeToUtcStartOfCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function normalizeToUtcEndOfCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * 將「日曆日」轉為該日 00:00:00.000 UTC。
 * 字串若為 YYYY-MM-DD 則語意即為日曆日；其餘字串或 Date 則取該瞬間的 UTC 日曆日。
 * （避免 parseISO + startOfDay 依「伺服器本地時區」解讀，導致與 DB UTC 儲存差一天。）
 */
export function toStartOfDay(dateStr: string | Date): Date {
  if (typeof dateStr === "string") {
    const t = dateStr.trim();
    const m = YMD.exec(t);
    if (m) return parseDateOnlyUTC(t);
    const d = parseISO(t);
    if (!isValid(d)) throw new Error(`無效日期: ${dateStr}`);
    return normalizeToUtcStartOfCalendarDay(d);
  }
  if (!isValid(dateStr)) throw new Error(`無效日期`);
  return normalizeToUtcStartOfCalendarDay(dateStr);
}

/** 該 UTC 日曆日的 23:59:59.999 UTC */
export function toEndOfDay(dateStr: string | Date): Date {
  if (typeof dateStr === "string") {
    const t = dateStr.trim();
    const m = YMD.exec(t);
    if (m) return endOfDayUTC(t);
    const d = parseISO(t);
    if (!isValid(d)) throw new Error(`無效日期: ${dateStr}`);
    return normalizeToUtcEndOfCalendarDay(d);
  }
  if (!isValid(dateStr)) throw new Error(`無效日期`);
  return normalizeToUtcEndOfCalendarDay(dateStr);
}

/** 日期區間（start 為 UTC 日初、end 為 UTC 日末） */
export function toDateRange(startStr: string, endStr: string): { start: Date; end: Date } {
  return {
    start: toStartOfDay(startStr),
    end: toEndOfDay(endStr),
  };
}

/** 格式化為 YYYY-MM-DD（依 UTC 日曆日，與 parseDateOnlyUTC / DB 儲存一致） */
export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 瀏覽器／使用者本地「今天」等預設值（勿用 toISOString().slice，在 UTC+8 凌晨會變成前一天） */
export function formatLocalDateInput(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TAIPEI_TZ = "Asia/Taipei";

/** API 預設「今日」等：依台灣日曆日（與營運日一致） */
export function formatDateOnlyTaipei(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return formatDateOnly(d);
  return `${y}-${m}-${day}`;
}

/** 將 YYYY-MM-DD 解析為該日 00:00:00 UTC，避免伺服器時區造成日期錯位 */
export function parseDateOnlyUTC(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) throw new Error(`無效日期格式: ${dateStr}`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
}

/** 該日 23:59:59.999 UTC（用於區間查詢） */
export function endOfDayUTC(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) throw new Error(`無效日期格式: ${dateStr}`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999));
}

/** YYYY-MM-DD 加減整數天（UTC 日曆），回傳新的 YYYY-MM-DD */
export function addCalendarDaysUTC(dateStr: string, delta: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDateOnly(d);
}

/**
 * 將 YYYY-MM-DD 視為「台北」營運日曆日（與使用者選的日期一致），回傳該日 00:00 / 23:59:59.999 台北時間對應的 UTC 瞬間。
 * 用於篩選 DB 內可能混有 UTC 0 點與舊版本地午夜（對應到前一日 UTC）的 timestamp。
 */
export function parseTaipeiDateStartUTC(ymd: string): Date {
  const t = String(ymd).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!match) throw new Error(`無效日期格式: ${ymd}`);
  return new Date(`${t}T00:00:00+08:00`);
}

export function parseTaipeiDateEndUTC(ymd: string): Date {
  const t = String(ymd).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!match) throw new Error(`無效日期格式: ${ymd}`);
  return new Date(`${t}T23:59:59.999+08:00`);
}

export function toDateRangeTaipei(startStr: string, endStr: string): { start: Date; end: Date } {
  return {
    start: parseTaipeiDateStartUTC(startStr),
    end: parseTaipeiDateEndUTC(endStr),
  };
}

/** 取得週的起始日 (週一) — 依執行環境本地時區 */
export function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.setDate(diff)));
}
