export type SupportSeverity = "none" | "partial" | "covered" | "empty";

export type SupportLayer = "actual" | "planned";

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
  coveredCountActual: number;
  coveredRateActual: number | null;
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

