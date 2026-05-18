import type {
  DailyStorePerformance,
  RetailStore,
  StaffSchedule,
  StoreTarget,
  TmsTransaction,
} from "@prisma/client";
import { formatDateOnly } from "@/lib/date";
import { decimalToNumber } from "@/lib/operations";

export function serializeRetailStore(s: RetailStore) {
  return {
    id: s.id,
    storeName: s.storeName,
    region: s.region,
    managerName: s.managerName,
    dailyBusinessHours: decimalToNumber(s.dailyBusinessHours),
    defaultLaborHoursPerDay: decimalToNumber(s.defaultLaborHoursPerDay),
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function serializeStoreTarget(
  t: StoreTarget & { store?: Pick<RetailStore, "storeName" | "region"> }
) {
  return {
    id: t.id,
    storeId: t.storeId,
    storeName: t.store?.storeName ?? null,
    region: t.store?.region ?? null,
    year: t.year,
    month: t.month,
    salesTarget: Number(t.salesTarget),
    laborHourTarget: Number(t.laborHourTarget),
    rplhTarget: decimalToNumber(t.rplhTarget),
    note: t.note,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeDailyStorePerformance(
  d: DailyStorePerformance & { store?: Pick<RetailStore, "storeName"> }
) {
  return {
    id: d.id,
    storeId: d.storeId,
    storeName: d.store?.storeName ?? null,
    date: formatDateOnly(d.date),
    salesAmount: Number(d.salesAmount),
    customerCount: d.customerCount,
    avgOrderValue: decimalToNumber(d.avgOrderValue),
    totalLaborHours: Number(d.totalLaborHours),
    overtimeHours: Number(d.overtimeHours),
    leaveHours: Number(d.leaveHours),
    weather: d.weather,
    eventNote: d.eventNote,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function serializeTmsTransaction(
  t: TmsTransaction & { store?: Pick<RetailStore, "storeName"> }
) {
  return {
    id: t.id,
    storeId: t.storeId,
    storeName: t.store?.storeName ?? null,
    transactionTime: t.transactionTime.toISOString(),
    orderNo: t.orderNo,
    amount: Number(t.amount),
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeStaffSchedule(
  s: StaffSchedule & { store?: Pick<RetailStore, "storeName"> }
) {
  return {
    id: s.id,
    storeId: s.storeId,
    storeName: s.store?.storeName ?? null,
    staffName: s.staffName,
    workDate: formatDateOnly(s.workDate),
    startTime: s.startTime,
    endTime: s.endTime,
    position: s.position,
    isManager: s.isManager,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
