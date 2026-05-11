import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";

export type MonthParsed = { year: number; month: number };

export type MonthWeekSegment = {
  index: number;
  startYmd: string;
  endYmd: string;
};

export function parseMonthParam(month: string): MonthParsed | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mm)) return null;
  if (mm < 1 || mm > 12) return null;
  return { year, month: mm };
}

/** 月初、月末 YYYY-MM-DD（UTC 日曆日），month 為 1～12 */
export function monthStartEndYmd(year: number, month: number): { startYmd: string; endYmd: string } {
  const startYmd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  const endYmd = formatDateOnly(lastDay);
  return { startYmd, endYmd };
}

/** 區間內（含）逐日 UTC，排除週日與 Holiday 後的天數（與門市達標週工作日加總邏輯一致） */
export function countWorkingDaysInRangeUTC(
  startYmd: string,
  endYmd: string,
  holidayYmdSet: Set<string>
): number {
  const split = splitWeekdaySaturdayWorkingDaysInRangeUTC(startYmd, endYmd, holidayYmdSet);
  return split.weekday + split.saturday;
}

/** 同上區間，拆成平日（週一至週五）與週六之工作天數 */
export function splitWeekdaySaturdayWorkingDaysInRangeUTC(
  startYmd: string,
  endYmd: string,
  holidayYmdSet: Set<string>
): { weekday: number; saturday: number } {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);
  let weekday = 0;
  let saturday = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    if (d.getUTCDay() === 0) continue;
    if (holidayYmdSet.has(ymd)) continue;
    if (d.getUTCDay() === 6) saturday += 1;
    else weekday += 1;
  }
  return { weekday, saturday };
}

/**
 * 依門市達標規則切週：週日斷開，不含週日的連續區間為一週。
 * dateToWeekIndex：非週日且落在某週內之 ymd -> 0-based 週序
 */
export function buildWeeksForMonth(
  startYmd: string,
  endYmd: string
): { weeks: MonthWeekSegment[]; dateToWeekIndex: Map<string, number> } {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);

  const weeks: MonthWeekSegment[] = [];
  const dateToWeekIndex = new Map<string, number>();

  let currentStart: string | null = null;
  let currentEnd: string | null = null;

  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    const isSunday = d.getUTCDay() === 0;
    if (isSunday) {
      if (currentStart && currentEnd) {
        const idx0 = weeks.length;
        weeks.push({ index: idx0 + 1, startYmd: currentStart, endYmd: currentEnd });
        for (let day = currentStart; day <= currentEnd; day = addCalendarDaysUTC(day, 1)) {
          const dd = parseDateOnlyUTC(day);
          if (dd.getUTCDay() === 0) continue;
          dateToWeekIndex.set(day, idx0);
        }
      }
      currentStart = null;
      currentEnd = null;
      continue;
    }

    if (!currentStart) currentStart = ymd;
    currentEnd = ymd;
  }

  if (currentStart && currentEnd) {
    const idx0 = weeks.length;
    weeks.push({ index: idx0 + 1, startYmd: currentStart, endYmd: currentEnd });
    for (let day = currentStart; day <= currentEnd; day = addCalendarDaysUTC(day, 1)) {
      const dd = parseDateOnlyUTC(day);
      if (dd.getUTCDay() === 0) continue;
      dateToWeekIndex.set(day, idx0);
    }
  }

  return { weeks, dateToWeekIndex };
}

/** 自 ymd 往月初回推，找第一個落在 buildWeeksForMonth 週切分內的日（週日不在 map 內）。 */
export function findWeekAnchorYmdOnOrBefore(
  ymd: string,
  monthStartYmd: string,
  dateToWeekIndex: Map<string, number>
): string | null {
  let cur = ymd;
  while (cur >= monthStartYmd) {
    if (dateToWeekIndex.has(cur)) return cur;
    cur = addCalendarDaysUTC(cur, -1);
  }
  return null;
}
