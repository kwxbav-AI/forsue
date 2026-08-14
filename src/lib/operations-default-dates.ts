import { formatDateOnlyTaipei, formatLocalDateInput } from "@/lib/date";

/** 以本機日曆：當月 1 號（YYYY-MM-DD） */
export function currentMonthStartYmdLocal(): string {
  const now = new Date();
  return formatLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** 以本機日曆：今天（YYYY-MM-DD） */
export function todayYmdLocal(): string {
  return formatLocalDateInput();
}

/** 以本機日曆：當月（YYYY-MM） */
export function currentMonthYmLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 月份字串（YYYY-MM）→ 月初（YYYY-MM-01） */
export function monthToStartDate(ym: string): string {
  return `${ym}-01`;
}

/** 月份字串（YYYY-MM）→ 月末（YYYY-MM-DD，UTC 末日） */
export function monthToEndDate(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}

/** 以台北日曆：當月 1 號～今天 */
export function currentMonthRangeLocal(): { startDate: string; endDate: string } {
  return {
    startDate: currentMonthStartYmdLocal(),
    endDate: todayYmdLocal(),
  };
}

/** 以台北日曆：當月 1 號～今天（API 用） */
export function currentMonthRangeTaipei(): { startDate: string; endDate: string } {
  const endDate = formatDateOnlyTaipei();
  const [y, m] = endDate.split("-").map(Number);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  return { startDate, endDate };
}
