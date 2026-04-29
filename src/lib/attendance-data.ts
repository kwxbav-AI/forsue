import { prisma } from "@/lib/prisma";
import { formatDateOnly, formatDateOnlyTaipei, parseTaipeiDateStartUTC, toStartOfDay } from "@/lib/date";

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

export function newHirePercentByWorkedDays(dayNo: number): number {
  if (!Number.isFinite(dayNo) || dayNo <= 0) return 1;
  if (dayNo >= 1 && dayNo <= 5) return 0;
  if (dayNo >= 6 && dayNo <= 10) return 0.5;
  if (dayNo >= 11 && dayNo <= 15) return 0.7;
  if (dayNo >= 16 && dayNo <= 20) return 0.9;
  return 1;
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

export function buildNewHireWorkedDayNoIndex(
  attendanceRows: { employeeId: string; workDate: Date }[],
  hireDateByEmployeeId: Map<string, Date>,
  attendanceDataStartDate: Date,
  employeeCodeByEmployeeId: Map<string, string>,
  overridesByEmployeeCode: Map<string, number>
): Map<string, Map<string, number>> {
  const dateSetByEmp = new Map<string, Set<string>>();
  for (const r of attendanceRows) {
    const hire = hireDateByEmployeeId.get(r.employeeId);
    if (!hire) continue;
    // 以日曆日比較，避免時區/時間戳造成邊界誤判。
    if (formatDateOnly(r.workDate) < formatDateOnly(hire)) continue;
    const dayStr = formatDateOnly(r.workDate);
    if (!dateSetByEmp.has(r.employeeId)) dateSetByEmp.set(r.employeeId, new Set());
    dateSetByEmp.get(r.employeeId)!.add(dayStr);
  }

  const index = new Map<string, Map<string, number>>();
  const dataStartYmd = formatDateOnly(attendanceDataStartDate);
  for (const [empId, set] of dateSetByEmp.entries()) {
    const hire = hireDateByEmployeeId.get(empId);
    const empCode = employeeCodeByEmployeeId.get(empId) ?? "";
    const hasOverride = empCode ? overridesByEmployeeCode.has(empCode) : false;
    let assumedBeforeStart =
      hire != null
        ? resolveAssumedWorkedDayOffset({
            employeeCode: empCode,
            hireDate: hire,
            dataStartDate: attendanceDataStartDate,
            overridesByEmployeeCode,
          })
        : 0;
    const sorted = Array.from(set).sort();
    const actualBeforeStart = sorted.filter((d) => d < dataStartYmd).length;

    // 若資料庫中其實已經有 dataStartDate 以前的出勤日，代表不是「缺資料」情境；
    // 不該套用 assumedBeforeStart（會把 dayNo 再往上推），除非使用者明確設定 override。
    if (!hasOverride && actualBeforeStart > 0) {
      assumedBeforeStart = 0;
    }

    const byDate = new Map<string, number>();
    for (let i = 0; i < sorted.length; i++) {
      const dayStr = sorted[i];
      // 覆寫值語意：代表「資料開始日前」應算的累計天數，取代實際資料開始日前的累計。
      if (dayStr >= dataStartYmd && assumedBeforeStart > 0) {
        const afterIndex = i - actualBeforeStart;
        byDate.set(dayStr, assumedBeforeStart + afterIndex + 1);
      } else {
        byDate.set(dayStr, i + 1);
      }
    }
    index.set(empId, byDate);
  }
  return index;
}

