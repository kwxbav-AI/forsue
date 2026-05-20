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
