import { prisma } from "@/lib/prisma";
import { UploadFileType } from "@prisma/client";
import type { AttendanceLocationMatchStatus } from "@prisma/client";
import type { ParseError } from "../types";
import { parseAttendanceSheet, type AttendanceRow } from "../parsers/attendance.parser";
import { parseDispatchSheet, type DispatchRow } from "../parsers/dispatch.parser";
import { parseEmployeeMasterSheet, type EmployeeMasterRow } from "../parsers/employee-master.parser";
import { parseRevenueSheet, type RevenueRow } from "../parsers/revenue.parser";
import { parseInventoryReferenceSheet } from "../parsers/inventory-reference.parser";
import { parseDateOnlyUTC, formatDateOnly, formatDateOnlyTaipei, toStartOfDay } from "@/lib/date";
import Decimal from "decimal.js";
import type { UploadResult } from "../types";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";

/** 同一日多筆列會各自 new Date()，用 Set 無法去重；依 YYYY-MM-DD 只重算一次 */
function uniqueCalendarDates(dates: Date[]): Date[] {
  const map = new Map<string, Date>();
  for (const raw of dates) {
    const d = toWorkDateUTC(raw);
    const key = formatDateOnly(d);
    if (!map.has(key)) map.set(key, d);
  }
  const result: Date[] = [];
  map.forEach((v) => result.push(v));
  return result;
}

/**
 * 將「出勤表中的日期」統一轉成：台北日曆日對應的 UTC 00:00。
 * 目的：避免伺服器時區 / Excel Date 物件導致 DB 內日期落在前一天 UTC，
 * 進而讓報表用 YYYY-MM-DD 查詢永遠查不到。
 */
function toWorkDateUTC(input: Date): Date {
  const ymd = formatDateOnlyTaipei(input);
  return parseDateOnlyUTC(ymd);
}

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

function parseClockInfoTimeToMinutes(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function extractStoreTextFromClockInfo(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // 常見格式: [07:24:14]宜蘭區-校舍店 24公尺
  const withBracket = s.match(/^\s*\[[^\]]+\]\s*(.+?)\s*(\d+\s*公尺.*)?\s*$/);
  const candidate = (withBracket ? withBracket[1] : s).trim();
  if (!candidate) return null;

  // 去掉可能的距離尾巴: "... 24公尺" / "... 0公尺"
  const stripped = candidate.replace(/\s+\d+\s*公尺.*$/g, "").trim();
  return stripped || null;
}

function normalizeStoreText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[－–—]/g, "-")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/店$/g, "")
    .toLowerCase();
}

function resolveStoreIdFromStoreText(
  storeText: string,
  stores: { id: string; department: string | null; name: string }[]
): string | null {
  const key = normalizeStoreText(storeText);
  if (!key) return null;

  const candidates = stores.map((s) => ({
    id: s.id,
    depKey: s.department ? normalizeStoreText(s.department) : "",
    nameKey: normalizeStoreText(s.name),
  }));

  const exact = candidates.find((c) => c.depKey === key || c.nameKey === key);
  if (exact) return exact.id;

  const contains = candidates
    .filter(
      (c) =>
        (c.depKey && (c.depKey.includes(key) || key.includes(c.depKey))) ||
        c.nameKey.includes(key) ||
        key.includes(c.nameKey)
    )
    .sort((a, b) => {
      const la = Math.max(a.depKey.length, a.nameKey.length);
      const lb = Math.max(b.depKey.length, b.nameKey.length);
      return lb - la;
    })[0];
  return contains?.id ?? null;
}

async function getExcludedDepartments(): Promise<string[]> {
  const key = "attendance.location.excludedDepartments";
  const row = await prisma.appSetting.findUnique({
    where: { key },
    select: { valueJson: true },
  });
  const raw = row?.valueJson as unknown;
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    return raw.map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function isDepartmentExcluded(department: string | null, excluded: string[]): boolean {
  if (!department) return false;
  const dep = department.trim();
  if (!dep) return false;
  const depKey = normalizeDepartment(dep);
  return excluded.some((x) => normalizeDepartment(x) === depKey);
}

function computeLocationMatchStatus(args: {
  excluded: boolean;
  hasDispatch: boolean;
  baseStoreId: string | null;
  clockInStoreId: string | null;
  clockOutStoreId: string | null;
  clockInMin: number | null;
  clockOutMin: number | null;
  dispatchStartMin: number | null;
  dispatchEndMin: number | null;
  dispatchToStoreId: string | null;
}): AttendanceLocationMatchStatus {
  const {
    excluded,
    hasDispatch,
    baseStoreId,
    clockInStoreId,
    clockOutStoreId,
    clockInMin,
    clockOutMin,
    dispatchStartMin,
    dispatchEndMin,
    dispatchToStoreId,
  } = args;

  if (excluded && !hasDispatch) return "EXCLUDED";
  if (!baseStoreId) return "UNKNOWN";
  if (!clockInStoreId && !clockOutStoreId) return "UNKNOWN";

  const inOkNoDispatch = clockInStoreId ? clockInStoreId === baseStoreId : null;
  const outOkNoDispatch = clockOutStoreId ? clockOutStoreId === baseStoreId : null;

  if (!hasDispatch) {
    if (inOkNoDispatch === true && outOkNoDispatch === true) return "MATCH";
    if (inOkNoDispatch === false && outOkNoDispatch === true) return "MISMATCH_CLOCKIN";
    if (inOkNoDispatch === true && outOkNoDispatch === false) return "MISMATCH_CLOCKOUT";
    if (inOkNoDispatch === false && outOkNoDispatch === false) return "MISMATCH_BOTH";
    return "UNKNOWN";
  }

  if (!dispatchToStoreId) return "NEED_REVIEW";
  const allowed = new Set([baseStoreId, dispatchToStoreId]);
  const inAllowed = clockInStoreId ? allowed.has(clockInStoreId) : true;
  const outAllowed = clockOutStoreId ? allowed.has(clockOutStoreId) : true;

  if (!inAllowed || !outAllowed) {
    if (clockInStoreId && !allowed.has(clockInStoreId) && clockOutStoreId && !allowed.has(clockOutStoreId))
      return "MISMATCH_BOTH";
    if (clockInStoreId && !allowed.has(clockInStoreId)) return "MISMATCH_CLOCKIN";
    if (clockOutStoreId && !allowed.has(clockOutStoreId)) return "MISMATCH_CLOCKOUT";
  }

  if (dispatchStartMin == null || dispatchEndMin == null || clockInMin == null || clockOutMin == null) {
    return "DISPATCH_EXPLAINED";
  }

  const expectedIn =
    clockInMin >= dispatchStartMin && clockInMin < dispatchEndMin ? dispatchToStoreId : baseStoreId;
  const expectedOut =
    clockOutMin >= dispatchStartMin && clockOutMin < dispatchEndMin ? dispatchToStoreId : baseStoreId;

  const inOk = clockInStoreId ? clockInStoreId === expectedIn : true;
  const outOk = clockOutStoreId ? clockOutStoreId === expectedOut : true;

  const dispatchInsideWork = clockInMin < dispatchStartMin && clockOutMin >= dispatchEndMin;
  const bothAtBase =
    (clockInStoreId ? clockInStoreId === baseStoreId : true) &&
    (clockOutStoreId ? clockOutStoreId === baseStoreId : true);
  if (dispatchInsideWork && bothAtBase) return "NEED_REVIEW";

  if (inOk && outOk) return "DISPATCH_EXPLAINED";
  if (!inOk && outOk) return "MISMATCH_CLOCKIN";
  if (inOk && !outOk) return "MISMATCH_CLOCKOUT";
  return "MISMATCH_BOTH";
}

/** 依員工 code 查 id，找不到回 null */
async function getEmployeeIdByCode(code: string): Promise<string | null> {
  const emp = await prisma.employee.findFirst({
    where: { employeeCode: code.trim() },
  });
  return emp?.id ?? null;
}

function normalizeEmployeeName(value: string): string {
  // 移除各種空白（含全形空白）與零寬字元，避免「看起來一樣但 contains 找不到」
  return value
    .trim()
    .replace(/[\s\u3000\u200B\u200C\u200D\uFEFF]+/g, "")
    .trim();
}

/** 取得或建立員工（出勤上傳時若無此人則自動建立，姓名可選） */
async function getOrCreateEmployee(employeeCode: string, name?: string): Promise<string> {
  const code = employeeCode.trim();
  const existing = await prisma.employee.findUnique({
    where: { employeeCode: code },
  });
  if (existing) {
    const incomingName = name ? normalizeEmployeeName(name) : "";
    // 若員工已存在但姓名仍是預設值（例如第一次匯入缺少姓名欄位時用工號代填），
    // 後續出勤匯入若帶了姓名，這裡順便補齊，避免「用姓名查不到」。
    const existingName = existing.name ? normalizeEmployeeName(existing.name) : "";
    if (incomingName && (!existingName || existingName === code)) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: { name: incomingName },
      });
    }
    return existing.id;
  }
  const created = await prisma.employee.create({
    data: {
      employeeCode: code,
      name: (name ? normalizeEmployeeName(name) : "") || code,
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
        hireDate: row.hireDate ? toStartOfDay(row.hireDate) : null,
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
      hireDate: row.hireDate ? toStartOfDay(row.hireDate) : null,
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

  const dates = parsed.data.map((r) => toWorkDateUTC(r.workDate));
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

  const excludedDepartments = await getExcludedDepartments();

  // 先建立員工，後面可一次抓同日調度（避免每列查 DB）
  const employeeIdByCode = new Map<string, string>();
  const rowEmployeeIds: string[] = [];
  for (const row of parsed.data) {
    const eid = await getOrCreateEmployee(row.employeeCode, row.employeeName);
    employeeIdByCode.set(row.employeeCode.trim(), eid);
    rowEmployeeIds.push(eid);
  }

  const dispatchByEmpDate = new Map<
    string,
    { toStoreId: string; startTime: string | null; endTime: string | null }[]
  >();
  if (rowEmployeeIds.length > 0 && uniqueDates.length > 0) {
    const dispatches = await prisma.dispatchRecord.findMany({
      where: {
        employeeId: { in: Array.from(new Set(rowEmployeeIds)) },
        workDate: { in: uniqueDates },
      },
      select: { employeeId: true, workDate: true, toStoreId: true, startTime: true, endTime: true },
      orderBy: { createdAt: "desc" },
    });
    for (const d of dispatches) {
      const key = `${formatDateOnly(d.workDate)}|${d.employeeId}`;
      const list = dispatchByEmpDate.get(key) ?? [];
      list.push({ toStoreId: d.toStoreId, startTime: d.startTime ?? null, endTime: d.endTime ?? null });
      dispatchByEmpDate.set(key, list);
    }
  }

  for (const row of parsed.data) {
    const workDate = toWorkDateUTC(row.workDate);
    const employeeId = employeeIdByCode.get(row.employeeCode.trim())!;
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

    const clockInStoreText = extractStoreTextFromClockInfo(row.clockInInfoRaw);
    const clockOutStoreText = extractStoreTextFromClockInfo(row.clockOutInfoRaw);
    const clockInStoreId = clockInStoreText
      ? resolveStoreIdFromStoreText(clockInStoreText, storesForDept)
      : null;
    const clockOutStoreId = clockOutStoreText
      ? resolveStoreIdFromStoreText(clockOutStoreText, storesForDept)
      : null;
    const clockInMin = parseClockInfoTimeToMinutes(row.clockInInfoRaw);
    const clockOutMin = parseClockInfoTimeToMinutes(row.clockOutInfoRaw);

    const empDateKey = `${formatDateOnly(workDate)}|${employeeId}`;
    const dispatchList = dispatchByEmpDate.get(empDateKey) ?? [];
    const hasDispatch = dispatchList.length > 0;
    const firstDispatch = dispatchList[0] ?? null;
    const dispatchStartMin = firstDispatch?.startTime ? parseClockInfoTimeToMinutes(`[${firstDispatch.startTime}:00]`) : null;
    const dispatchEndMin = firstDispatch?.endTime ? parseClockInfoTimeToMinutes(`[${firstDispatch.endTime}:00]`) : null;
    const dispatchToStoreId = firstDispatch?.toStoreId ?? null;

    const excluded = isDepartmentExcluded(row.department, excludedDepartments);
    const status = computeLocationMatchStatus({
      excluded,
      hasDispatch,
      baseStoreId: originalStoreId,
      clockInStoreId,
      clockOutStoreId,
      clockInMin,
      clockOutMin,
      dispatchStartMin,
      dispatchEndMin,
      dispatchToStoreId,
    });

    await prisma.attendanceRecord.create({
      data: {
        workDate,
        employeeId,
        originalStoreId,
        department: row.department,
        workHours: row.workHours.toNumber(),
        scheduledWorkHours: row.scheduledWorkHours ? row.scheduledWorkHours.toNumber() : null,
        startTime: row.startTime,
        endTime: row.endTime,
        clockInInfoRaw: row.clockInInfoRaw,
        clockOutInfoRaw: row.clockOutInfoRaw,
        clockInStoreText,
        clockOutStoreText,
        clockInStoreId,
        clockOutStoreId,
        locationMatchStatus: status,
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
