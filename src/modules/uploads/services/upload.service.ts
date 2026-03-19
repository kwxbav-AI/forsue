import { prisma } from "@/lib/prisma";
import { UploadFileType } from "@prisma/client";
import type { ParseError } from "../types";
import { parseAttendanceSheet, type AttendanceRow } from "../parsers/attendance.parser";
import { parseDispatchSheet, type DispatchRow } from "../parsers/dispatch.parser";
import { parseEmployeeMasterSheet, type EmployeeMasterRow } from "../parsers/employee-master.parser";
import { parseRevenueSheet, type RevenueRow } from "../parsers/revenue.parser";
import { parseInventoryReferenceSheet } from "../parsers/inventory-reference.parser";
import { toStartOfDay, formatDateOnly } from "@/lib/date";
import Decimal from "decimal.js";

/** 同一日多筆列會各自 new Date()，用 Set 無法去重；依 YYYY-MM-DD 只重算一次 */
function uniqueCalendarDates(dates: Date[]): Date[] {
  const map = new Map<string, Date>();
  for (const raw of dates) {
    const d = toStartOfDay(raw);
    const key = formatDateOnly(d);
    if (!map.has(key)) map.set(key, d);
  }
  const result: Date[] = [];
  map.forEach((v) => result.push(v));
  return result;
}
import type { UploadResult } from "../types";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";

/** 依門市 code 查 id，找不到回 null */
async function getStoreIdByCode(code: string): Promise<string | null> {
  if (!code) return null;
  const key = code.trim();
  const store = await prisma.store.findFirst({
    where: { OR: [{ code: key }, { name: key }] },
  });
  if (store) return store.id;
  const alias = await prisma.storeAlias.findUnique({
    where: { code: key },
    select: { storeId: true },
  });
  return alias?.storeId ?? null;
}

/** 一次載入門市代碼／名稱／別名 → storeId，營收上傳每列只查 Map、不打 DB */
async function buildStoreCodeLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const stores = await prisma.store.findMany({
    select: { id: true, code: true, name: true },
  });
  for (const s of stores) {
    if (s.code?.trim()) map.set(s.code.trim(), s.id);
    map.set(s.name.trim(), s.id);
  }
  const aliases = await prisma.storeAlias.findMany({
    select: { code: true, storeId: true },
  });
  for (const a of aliases) {
    map.set(a.code.trim(), a.storeId);
  }
  return map;
}

/** 依部門名稱查門市 id（出勤表若部門與門市欄不一致時使用） */
function normalizeDepartment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[－–—]/g, "-")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/店$/g, "")
    .toLowerCase();
}

function resolveStoreIdFromDepartment(
  department: string,
  stores: { id: string; department: string | null; name: string }[]
): string | null {
  const key = normalizeDepartment(department);
  if (!key) return null;

  const candidates = stores
    .filter((s) => s.department)
    .map((s) => ({ ...s, depKey: normalizeDepartment(s.department!) }))
    .filter((s) => s.depKey);

  // 1) 完全相等
  const exact = candidates.find((c) => c.depKey === key);
  if (exact) return exact.id;

  // 2) 互相包含（取最長匹配，避免「宜蘭區」誤配多店）
  const contains = candidates
    .filter((c) => c.depKey.includes(key) || key.includes(c.depKey))
    .sort((a, b) => b.depKey.length - a.depKey.length)[0];
  return contains?.id ?? null;
}

/** 依員工 code 查 id，找不到回 null */
async function getEmployeeIdByCode(code: string): Promise<string | null> {
  const emp = await prisma.employee.findFirst({
    where: { employeeCode: code.trim() },
  });
  return emp?.id ?? null;
}

/** 取得或建立員工（出勤上傳時若無此人則自動建立，姓名可選） */
async function getOrCreateEmployee(employeeCode: string, name?: string): Promise<string> {
  const code = employeeCode.trim();
  const existing = await prisma.employee.findUnique({
    where: { employeeCode: code },
  });
  if (existing) return existing.id;
  const created = await prisma.employee.create({
    data: {
      employeeCode: code,
      name: (name && name.trim()) || code,
    },
  });
  return created.id;
}

/** 建立或取得員工（名冊用） */
async function upsertEmployee(row: EmployeeMasterRow): Promise<string> {
  const defaultStoreId = row.storeCode ? await getStoreIdByCode(row.storeCode) : null;
  const existing = await prisma.employee.findUnique({
    where: { employeeCode: row.employeeCode },
  });
  if (existing) {
    await prisma.employee.update({
      where: { id: existing.id },
      data: {
        name: row.name,
        defaultStoreId,
        position: row.position ?? undefined,
      },
    });
    return existing.id;
  }
  const created = await prisma.employee.create({
    data: {
      employeeCode: row.employeeCode,
      name: row.name,
      defaultStoreId,
      position: row.position ?? undefined,
    },
  });
  return created.id;
}

export async function uploadAttendance(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string
): Promise<UploadResult> {
  const parsed = parseAttendanceSheet(buffer);
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      success: false,
      importedCount: 0,
      failedCount: parsed.errors.length,
      errors: parsed.errors,
    };
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      fileType: "ATTENDANCE",
      originalName,
      storedName: `attendance_${Date.now()}_${originalName}`,
      uploadedBy,
      recordCount: 0,
      status: "SUCCESS",
    },
  });

  const dates = parsed.data.map((r) => toStartOfDay(r.workDate));
  const uniqueDates: Date[] = [];
  const uniqueTimes = new Set<number>();
  dates.forEach((d) => uniqueTimes.add(d.getTime()));
  uniqueTimes.forEach((t) => uniqueDates.push(new Date(t)));
  await prisma.attendanceRecord.deleteMany({
    where: { workDate: { in: uniqueDates } },
  });

  const errors: ParseError[] = [...parsed.errors];
  let imported = 0;

  const storesForDept = await prisma.store.findMany({
    select: { id: true, department: true, name: true },
  });

  for (const row of parsed.data) {
    const employeeId = await getOrCreateEmployee(row.employeeCode, row.employeeName);
    let originalStoreId: string | null = null;
    if (row.storeCode) originalStoreId = await getStoreIdByCode(row.storeCode);
    if (!originalStoreId && row.department) {
      originalStoreId = resolveStoreIdFromDepartment(row.department, storesForDept);
    }

    // 門市/部門對不到也要允許匯入（後勤部門等可能未建檔）
    // 這筆會以 originalStoreId = null 存入，日後補齊門市/部門對照後可再重算
    if (!originalStoreId && (row.storeCode || row.department)) {
      errors.push({
        row: 0,
        field: "storeCode",
        message: `警示：找不到門市對應，仍已匯入（門市欄：${row.storeCode ?? "-"} / 部門：${row.department ?? "-" }）`,
      });
      originalStoreId = null;
    }

    await prisma.attendanceRecord.create({
      data: {
        workDate: toStartOfDay(row.workDate),
        employeeId,
        originalStoreId,
        department: row.department,
        workHours: row.workHours.toNumber(),
        startTime: row.startTime,
        endTime: row.endTime,
        shiftType: row.shiftType,
        uploadBatchId: batch.id,
      },
    });
    imported++;
  }

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: { recordCount: imported },
  });

  for (const d of uniqueCalendarDates(parsed.data.map((r) => r.workDate))) {
    await performanceEngineService.recalculateDailyPerformance(d);
  }

  return {
    success: errors.length === 0,
    batchId: batch.id,
    importedCount: imported,
    failedCount: errors.length,
    errors,
  };
}

export async function uploadDispatch(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string
): Promise<UploadResult> {
  const parsed = parseDispatchSheet(buffer);
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      success: false,
      importedCount: 0,
      failedCount: parsed.errors.length,
      errors: parsed.errors,
    };
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      fileType: "DISPATCH",
      originalName,
      storedName: `dispatch_${Date.now()}_${originalName}`,
      uploadedBy,
      recordCount: 0,
      status: "SUCCESS",
    },
  });

  const uniqueDates: Date[] = [];
  const uniqueTimes = new Set<number>();
  parsed.data.forEach((r) => uniqueTimes.add(toStartOfDay(r.workDate).getTime()));
  uniqueTimes.forEach((t) => uniqueDates.push(new Date(t)));
  await prisma.dispatchRecord.deleteMany({
    where: { workDate: { in: uniqueDates } },
  });

  const errors: ParseError[] = [...parsed.errors];
  let imported = 0;

  for (const row of parsed.data) {
    const employeeId = await getEmployeeIdByCode(row.employeeCode);
    const toStoreId = await getStoreIdByCode(row.toStoreCode);
    if (!employeeId) {
      errors.push({ row: 0, field: "employeeCode", message: `找不到員工：${row.employeeCode}` });
      continue;
    }
    if (!toStoreId) {
      errors.push({ row: 0, field: "toStoreCode", message: `找不到門市：${row.toStoreCode}` });
      continue;
    }
    const fromStoreId = row.fromStoreCode ? await getStoreIdByCode(row.fromStoreCode) : null;

    await prisma.dispatchRecord.create({
      data: {
        workDate: toStartOfDay(row.workDate),
        employeeId,
        fromStoreId,
        toStoreId,
        dispatchHours: row.dispatchHours.toNumber(),
        remark: row.remark,
        uploadBatchId: batch.id,
      },
    });
    imported++;
  }

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: { recordCount: imported },
  });

  for (const d of uniqueCalendarDates(parsed.data.map((r) => r.workDate))) {
    await performanceEngineService.recalculateDailyPerformance(d);
  }

  return {
    success: errors.length === 0,
    batchId: batch.id,
    importedCount: imported,
    failedCount: errors.length,
    errors,
  };
}

export async function uploadEmployeeMaster(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string
): Promise<UploadResult> {
  const parsed = parseEmployeeMasterSheet(buffer);
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      success: false,
      importedCount: 0,
      failedCount: parsed.errors.length,
      errors: parsed.errors,
    };
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      fileType: "EMPLOYEE_MASTER",
      originalName,
      storedName: `employee_${Date.now()}_${originalName}`,
      uploadedBy,
      recordCount: 0,
      status: "SUCCESS",
      effectiveDate: new Date(),
    },
  });

  const errors: ParseError[] = [...parsed.errors];
  let imported = 0;

  for (const row of parsed.data) {
    try {
      await upsertEmployee(row);
      imported++;
    } catch (e) {
      errors.push({
        row: 0,
        message: `員工 ${row.employeeCode}: ${e instanceof Error ? e.message : "寫入失敗"}`,
      });
    }
  }

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: { recordCount: imported },
  });

  return {
    success: errors.length === 0,
    batchId: batch.id,
    importedCount: imported,
    failedCount: errors.length,
    errors,
  };
}

export async function uploadDailyRevenue(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string
): Promise<UploadResult> {
  const parsed = parseRevenueSheet(buffer);
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      success: false,
      importedCount: 0,
      failedCount: parsed.errors.length,
      errors: parsed.errors,
    };
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      fileType: "DAILY_REVENUE",
      originalName,
      storedName: `revenue_${Date.now()}_${originalName}`,
      uploadedBy,
      recordCount: 0,
      status: "SUCCESS",
    },
  });

  const errors: ParseError[] = [...parsed.errors];
  let imported = 0;

  const storeLookup = await buildStoreCodeLookup();

  // 先依 (日期, 門市) 彙總各 POS (A/B/C...) 的金額，再寫入資料庫
  const aggregated = new Map<
    string,
    {
      revenueDate: Date;
      storeId: string;
      amount: Decimal;
      cashIncome: Decimal;
      linePayAmount: Decimal;
      expenseAmount: Decimal;
    }
  >();

  for (const row of parsed.data) {
    const storeId = storeLookup.get(row.storeCode.trim()) ?? null;
    if (!storeId) {
      errors.push({ row: 0, field: "storeCode", message: `找不到門市：${row.storeCode}` });
      continue;
    }

    const revenueDate = toStartOfDay(row.revenueDate);
    const key = `${revenueDate.toISOString()}:${storeId}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.amount = existing.amount.plus(row.revenueAmount);
      existing.cashIncome = existing.cashIncome.plus(row.cashIncome);
      existing.linePayAmount = existing.linePayAmount.plus(row.linePayAmount);
      existing.expenseAmount = existing.expenseAmount.plus(row.expenseAmount);
    } else {
      aggregated.set(key, {
        revenueDate,
        storeId,
        amount: row.revenueAmount,
        cashIncome: row.cashIncome,
        linePayAmount: row.linePayAmount,
        expenseAmount: row.expenseAmount,
      });
    }
  }

  const aggList: any[] = [];
  aggregated.forEach((v) => aggList.push(v));
  const UPSERT_CHUNK = 32;
  for (let i = 0; i < aggList.length; i += UPSERT_CHUNK) {
    const chunk = aggList.slice(i, i + UPSERT_CHUNK);
    await Promise.all(
      chunk.map(({ revenueDate, storeId, amount, cashIncome, linePayAmount, expenseAmount }) =>
        prisma.revenueRecord.upsert({
          where: {
            revenueDate_storeId: {
              revenueDate,
              storeId,
            },
          },
          create: {
            revenueDate,
            storeId,
            revenueAmount: amount.toNumber(),
            cashIncome: cashIncome.toNumber(),
            linePayAmount: linePayAmount.toNumber(),
            expenseAmount: expenseAmount.toNumber(),
            uploadBatchId: batch.id,
          },
          update: {
            revenueAmount: amount.toNumber(),
            cashIncome: cashIncome.toNumber(),
            linePayAmount: linePayAmount.toNumber(),
            expenseAmount: expenseAmount.toNumber(),
            uploadBatchId: batch.id,
          },
        })
      )
    );
    imported += chunk.length;
  }

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: { recordCount: imported },
  });

  for (const d of uniqueCalendarDates(parsed.data.map((r) => r.revenueDate))) {
    await performanceEngineService.recalculateDailyPerformance(d);
  }

  return {
    success: errors.length === 0,
    batchId: batch.id,
    importedCount: imported,
    failedCount: errors.length,
    errors,
  };
}

export async function uploadInventoryReference(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string
): Promise<UploadResult> {
  const parsed = parseInventoryReferenceSheet(buffer);
  const batch = await prisma.uploadBatch.create({
    data: {
      fileType: "INVENTORY_REFERENCE",
      originalName,
      storedName: `inventory_${Date.now()}_${originalName}`,
      uploadedBy,
      recordCount: parsed.data.length,
      status: "SUCCESS",
      effectiveDate: new Date(),
    },
  });
  return {
    success: true,
    batchId: batch.id,
    importedCount: parsed.data.length,
    failedCount: 0,
    errors: parsed.errors,
  };
}
