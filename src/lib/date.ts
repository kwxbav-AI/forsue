import { startOfDay, endOfDay, parseISO, isValid, format } from "date-fns";

/** 將字串轉為當日 00:00:00 (以系統/指定時區) */
export function toStartOfDay(dateStr: string | Date): Date {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  if (!isValid(d)) throw new Error(`無效日期: ${dateStr}`);
  return startOfDay(d);
}

/** 將字串轉為當日 23:59:59.999 */
export function toEndOfDay(dateStr: string | Date): Date {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  if (!isValid(d)) throw new Error(`無效日期: ${dateStr}`);
  return endOfDay(d);
}

/** 日期區間（start 00:00, end 23:59） */
export function toDateRange(startStr: string, endStr: string): { start: Date; end: Date } {
  return {
    start: toStartOfDay(startStr),
    end: toEndOfDay(endStr),
  };
}

/** 格式化為 YYYY-MM-DD */
export function formatDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 將 YYYY-MM-DD 解析為該日 00:00:00 UTC，避免伺服器時區造成日期錯位（例如選 2/2 卻存成 2/1） */
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

/** 取得週的起始日 (週一) */
export function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.setDate(diff)));
}
