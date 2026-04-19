import { prisma } from "@/lib/prisma";
import { formatDateOnlyTaipei, parseTaipeiDateStartUTC, toStartOfDay } from "@/lib/date";

/** 到職日（台北日曆）在此日「之前」者，不套用新進員工工時比例；≥ 此日才可能套用。 */
export const NEW_HIRE_WORK_PERCENT_ELIGIBLE_MIN_YMD = "2026-03-24";

/**
 * 是否應套用「新進員工」工時比例（依到職日判定；無到職日則不套用）。
 */
export function isEligibleForNewHireWorkPercent(hireDate: Date | null | undefined): boolean {
  if (!hireDate) return false;
  const ymd = formatDateOnlyTaipei(hireDate);
  return ymd >= NEW_HIRE_WORK_PERCENT_ELIGIBLE_MIN_YMD;
}

// 你提到 4/1 才開始上傳出勤表；在此之前沒有出勤記錄時，new hire dayNo 需要 offset 補正。
// 可透過 AppSetting 調整（避免日後換系統啟用日又要改程式）。
const KEY_ATTENDANCE_DATA_START = "attendance.dataStartDate";
const DEFAULT_ATTENDANCE_DATA_START_YMD = "2026-04-01";

// 個別覆寫：employeeCode -> offset（整數天數）
// 例如：{"T2603505": 5}
const KEY_NEW_HIRE_OFFSET_OVERRIDES = "attendance.newHireOffsetOverrides";

export async function getAttendanceDataStartDate(): Promise<Date> {
  const row = await prisma.appSetting.findUnique({
    where: { key: KEY_ATTENDANCE_DATA_START },
    select: { valueJson: true },
  });
  const raw = row?.valueJson as unknown;
  const ymd = typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_ATTENDANCE_DATA_START_YMD;
  // toStartOfDay(YYYY-MM-DD) -> UTC 日初；用於比對/查詢
  return toStartOfDay(ymd);
}

export async function getNewHireOffsetOverridesByEmployeeCode(): Promise<Map<string, number>> {
  const row = await prisma.appSetting.findUnique({
    where: { key: KEY_NEW_HIRE_OFFSET_OVERRIDES },
    select: { valueJson: true },
  });
  const raw = row?.valueJson as unknown;
  const map = new Map<string, number>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const key = String(k).trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!key) continue;
      if (!Number.isFinite(n)) continue;
      map.set(key, Math.max(0, Math.floor(n)));
    }
  }
  return map;
}

/**
 * 混合補正（C）：
 * - 4/1 前沒有出勤資料時，新進員工的「已上班日」只能從資料開始日之後累計。
 * - 為避免 3/25 到職的人在 4/1 被當成 dayNo=1（0%），這裡用日曆天差補一個 offset。
 *
 * offset = max(0, calendarDays(dataStart) - calendarDays(hireDate))
 * dayNo 會用：offset + 實際有上班日累計
 */
export function calcAssumedWorkedDayOffsetByCalendar(args: {
  hireDate: Date;
  dataStartDate: Date;
}): number {
  const hireYmd = formatDateOnlyTaipei(args.hireDate);
  const startYmd = formatDateOnlyTaipei(args.dataStartDate);
  const hireStartUtc = parseTaipeiDateStartUTC(hireYmd);
  const startUtc = parseTaipeiDateStartUTC(startYmd);
  const diffDays = Math.floor((startUtc.getTime() - hireStartUtc.getTime()) / 86400000);
  return Math.max(0, diffDays);
}

export function resolveAssumedWorkedDayOffset(args: {
  employeeCode: string | null | undefined;
  hireDate: Date;
  dataStartDate: Date;
  overridesByEmployeeCode: Map<string, number>;
}): number {
  const code = String(args.employeeCode ?? "").trim();
  const overridden = code ? args.overridesByEmployeeCode.get(code) : undefined;
  if (overridden != null) return overridden;
  return calcAssumedWorkedDayOffsetByCalendar({ hireDate: args.hireDate, dataStartDate: args.dataStartDate });
}

