export type ShiftPlanCalendarShift = {
  storeId: string;
  storeName: string;
  employeeCode: string;
  employeeName: string | null;
  scheduledHours: number;
  startTime: string | null;
  endTime: string | null;
  shiftKind: string;
};

export type ShiftPlanCalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  staffCount: number;
  totalHours: number;
  shifts: ShiftPlanCalendarShift[];
};

export type ShiftPlanMonthResponse = {
  month: string;
  startDate: string;
  endDate: string;
  region: string | null;
  storeId: string | null;
  summary: {
    totalShifts: number;
    totalHours: number;
    daysWithData: number;
  };
  meta: {
    stores: { id: string; storeName: string; region: string }[];
  };
  calendarDays: ShiftPlanCalendarDay[];
};
