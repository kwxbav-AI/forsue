import { formatDateOnly } from "@/lib/date";
import { getAttendanceDataStartDate } from "@/lib/attendance-data";

/** 營運／圖表／每日工效比區間計算起算日（與出勤上傳起算日相同，預設 2026-04-01） */
export async function getPerformanceMetricsDataStartYmd(): Promise<string> {
  const d = await getAttendanceDataStartDate();
  return formatDateOnly(d);
}

export function clampMetricsDateRange(
  startDate: string,
  endDate: string,
  dataStartYmd: string
): {
  startDate: string;
  endDate: string;
  clamped: boolean;
} {
  if (startDate < dataStartYmd) {
    return { startDate: dataStartYmd, endDate, clamped: true };
  }
  return { startDate, endDate, clamped: false };
}
