import { formatDateOnly } from "@/lib/date";
import { getAttendanceDataStartDate } from "@/lib/attendance-data";

/** 營運總覽頂部 KPI「全公司營收達成值」累計起日 */
export const OPS_KPI_CUMULATIVE_START_YMD = "2026-01-01";

/** 上傳營收可查詢起日（2025-01 起歷史營收已匯入） */
export const OPS_REVENUE_METRICS_START_YMD = "2025-01-01";

/** 營運／圖表／每日工效比區間計算起算日（與出勤上傳起算日相同，預設 2026-04-01） */
export async function getPerformanceMetricsDataStartYmd(): Promise<string> {
  const d = await getAttendanceDataStartDate();
  return formatDateOnly(d);
}

/** 營收加總可查詢起日（含僅營收、尚無出勤之月份） */
export function getRevenueMetricsDataStartYmd(): string {
  return OPS_REVENUE_METRICS_START_YMD;
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
