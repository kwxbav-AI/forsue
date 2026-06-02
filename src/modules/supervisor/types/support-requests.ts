/** none=仍缺人 · partial=已補齊(支援後) · covered=完整人力 */
export type SupportSeverity = "none" | "partial" | "covered" | "empty";

export const SUPPORT_SEVERITY_LABELS: Record<Exclude<SupportSeverity, "empty">, string> = {
  covered: "完整人力",
  partial: "已補齊",
  none: "仍缺人",
};

export const SUPPORT_SEVERITY_HINTS: Record<Exclude<SupportSeverity, "empty">, string> = {
  covered: "該店人員充足，無人力缺口",
  partial: "原有缺人，申請人力支援後已補齊",
  none: "人力不足，尚須申請人力支援",
};

export type SupportLayer = "actual" | "planned";

export type SupportDataSource = "actual" | "forecast";

export type SupportCalendarDay = {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
  /** 當日有缺口或支援紀錄的門市數 */
  storeCount: number;
  /** 月曆顯示用（依層級切換） */
  severityActual: SupportSeverity;
  severityPlanned: SupportSeverity;
};

export type SupportRequestStaffRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  /** 來源門市（支援人員才會有） */
  fromStoreId: string | null;
  fromStoreName: string | null;
  /** 目的門市（支援人員才會有） */
  toStoreId: string;
  toStoreName: string | null;
  hours: number;
  confirmStatus: "已確認" | "待確認" | "—";
  startTime: string | null;
  endTime: string | null;
  remark: string | null;
  createdByCode: string | null;
  createdByName: string | null;
  filledAt: string | null;
};

export type SupportRequestAttendanceRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  workHours: number;
  startTime: string | null;
  endTime: string | null;
  shiftType: string | null;
};

export type SupportRequestStoreDay = {
  date: string; // YYYY-MM-DD
  storeId: string;
  storeName: string;
  region: string | null;

  /** 過去／今日＝出勤實績；未來＝排班預測 */
  dataSource: SupportDataSource;
  /** 未來日：排班預定總工時；過去日通常為 null */
  scheduledHours: number | null;

  targetHours: number | null;
  actualHoursConfirmed: number;

  supportInConfirmedHours: number;
  supportInPlannedHours: number;

  gapConfirmed: number | null;
  gapPlanned: number | null;

  statusActual: Exclude<SupportSeverity, "empty">;
  statusPlanned: Exclude<SupportSeverity, "empty">;

  originalStaff: SupportRequestAttendanceRow[];
  supportStaffConfirmed: SupportRequestStaffRow[];
  supportStaffPlanned: SupportRequestStaffRow[];
};

export type SupportRequestsByDate = {
  date: string;
  stores: SupportRequestStoreDay[];
};

export type SupportRequestsMonthSummary = {
  month: string; // YYYY-MM
  storeFilter: { storeId: string | null; storeName: string | null };
  requestCount: number;
  /** 完整人力（綠） */
  coveredCountActual: number;
  /** 已補齊（黃，支援後） */
  supplementedCountActual: number;
  coveredRateActual: number | null;
  /** 仍缺人（紅） */
  shortageCountActual: number;
  crossStoreSupportHoursConfirmed: number;
  crossStoreSupportHoursPlanned: number;
};

export type SupportRequestsMonthResponse = {
  month: string; // YYYY-MM
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  meta: {
    layerDefault: SupportLayer;
    stores: { id: string; storeName: string; region: string | null }[];
  };
  summary: SupportRequestsMonthSummary;
  calendarDays: SupportCalendarDay[];
  dates: SupportRequestsByDate[];
};

