import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
} from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import {
  computeStoreOvertimeHoursByStore,
  computeTotalWorkHoursByStore,
} from "@/modules/performance/services/attendance-allocation.service";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";
import { DUAL_OPS_REGIONS, normalizeStoreKey } from "@/lib/operations-dashboard";
import { addCalendarDaysUTC } from "@/lib/date";
import { resolveRetailStore } from "@/modules/operations/services/retail-store-match.service";
import {
  buildRangeDailyMetricsPrefetch,
  computeDailyMetricsByStoreResilientWithPrefetch,
} from "@/modules/performance/services/range-daily-metrics-prefetch.service";
import { isEfficiencyTargetMet } from "@/lib/operations-efficiency";
import { resolveScheduledHours } from "@/lib/scheduled-hours";

const DAY_CONCURRENCY = 12;

const ADJUSTMENT_LABELS: Record<string, string> = {
  STAFF_SHORTAGE: "人力不足",
  MEETING_REVIEW: "會議/考核",
  RESERVE_STAFF: "儲備人力",
  TRIAL: "試作",
  MANAGER_MEETING: "店長會議",
  PROMOTION_REVIEW: "晉升考核",
  OTHER: "其他",
};

const DEDUCTION_LABELS: Record<string, string> = {
  CLEANING: "清掃",
  INVENTORY_REGISTRATION: "現貨文登記",
  EXPIRY: "效期",
  OTHER: "其他",
};

function listDaysInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = addCalendarDaysUTC(d, 1);
  }
  return out;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function resolveMonthRange(year: number, month: number) {
  const { startYmd, endYmd: monthEnd } = monthStartEndYmd(year, month);
  const today = formatDateOnlyTaipei();
  const endYmd = monthEnd > today ? today : monthEnd;
  return { startYmd, endYmd };
}

/** 營運日 YMD（與上傳 toWorkDateUTC、@db.Date 一致；讀取時用台北日曆避免邊界錯位） */
function workDateYmd(d: Date): string {
  return formatDateOnlyTaipei(d);
}

function isYmdInRange(ymd: string, startYmd: string, endYmd: string): boolean {
  return ymd >= startYmd && ymd <= endYmd;
}

/** 顯示用：2026-05-01 → 5/1 */
function formatMonthDayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

type AttendanceForClockAnomaly = {
  workDate: Date;
  employeeId: string;
  clockInStoreText: string | null;
  clockOutStoreText: string | null;
  clockInStoreId: string | null;
  clockOutStoreId: string | null;
};

function describeClockAnomalyDetail(
  att: AttendanceForClockAnomaly,
  dispatchByEmpDate: Map<string, { toStoreName: string }>,
  storeNameById: Map<string, string>
): string {
  const ymd = workDateYmd(att.workDate);
  const label = formatMonthDayLabel(ymd);
  const dispatch = dispatchByEmpDate.get(`${att.employeeId}|${ymd}`);
  if (dispatch) {
    return `${label}支援${dispatch.toStoreName}`;
  }
  const clockId = att.clockInStoreId ?? att.clockOutStoreId;
  const clockName =
    att.clockInStoreText?.trim() ||
    att.clockOutStoreText?.trim() ||
    (clockId ? storeNameById.get(clockId) : null) ||
    "其他門市";
  return `${label}支援${clockName}`;
}

function homeStoreId(
  att: {
    employeeId: string;
    originalStoreId: string | null;
    employee: { defaultStoreId: string | null };
  },
  fallback: Map<string, string>
): string | null {
  return (
    att.employee.defaultStoreId ??
    fallback.get(att.employeeId) ??
    att.originalStoreId ??
    null
  );
}

function isLeaveShift(shiftType: string | null, scheduled: number | null, workHours: number) {
  const st = shiftType ? String(shiftType).trim() : "";
  const byText = st ? /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(st) : false;
  const byScheduled =
    scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && workHours < scheduled;
  return byText || byScheduled;
}

export async function buildOperationsWorkHours(input: {
  year: number;
  month: number;
  storeId?: string;
}) {
  const { startYmd, endYmd } = resolveMonthRange(input.year, input.month);
  const days = listDaysInRange(startYmd, endYmd);
  const filterStores = await listPerformanceStoresForFilter();
  const storeNameById = new Map(filterStores.map((s) => [s.id, s.storeName]));
  /** 月加班／異常清單僅顯示桃園＋宜蘭各 10 間門市 */
  const dualRegionStoreIds = new Set(
    filterStores
      .filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region))
      .map((s) => s.id)
  );
  const isDualRegionStore = (storeId: string | null | undefined) =>
    Boolean(storeId && dualRegionStoreIds.has(storeId));

  const resolveStoreName = (storeId: string | null | undefined, fallback?: string) => {
    if (!storeId) return fallback?.trim() || "—";
    return storeNameById.get(storeId) ?? (fallback?.trim() || storeId);
  };

  // @db.Date 用 in 精確比對各營運日，避免 gte/lte 與時區造成誤含前月末日（4/30、3/30）
  const workDatesInRange = days.map((ymd) => parseDateOnlyUTC(ymd));
  const workDateWhere =
    workDatesInRange.length > 0 ? { workDate: { in: workDatesInRange } } : { workDate: { in: [] as Date[] } };

  const [attendances, dispatches, adjustments, deductions, contentEntries] =
    await Promise.all([
      prisma.attendanceRecord.findMany({
        where: workDateWhere,
        include: { employee: { select: { id: true, name: true, employeeCode: true, defaultStoreId: true } } },
      }),
      prisma.dispatchRecord.findMany({
        where: { ...workDateWhere, confirmStatus: "已確認" },
        include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      }),
      prisma.workhourAdjustment.findMany({
        where: workDateWhere,
        include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      }),
      prisma.storeHourDeduction.findMany({
        where: workDateWhere,
        include: { store: { select: { id: true, name: true } } },
      }),
      prisma.contentEntry.findMany({
        where: {
          ...workDateWhere,
          deductedMinutes: { not: null, gt: 0 },
        },
        select: { id: true, workDate: true, branch: true, deductedMinutes: true },
      }),
    ]);

  const dispatchByEmpDate = new Map<string, { toStoreName: string }>();
  for (const d of dispatches) {
    const ymd = workDateYmd(d.workDate);
    if (!isYmdInRange(ymd, startYmd, endYmd)) continue;
    dispatchByEmpDate.set(`${d.employeeId}|${ymd}`, {
      toStoreName: resolveStoreName(d.toStoreId),
    });
  }

  const branchToStoreId = new Map<string, string>();
  for (const s of filterStores) {
    const n = s.storeName.trim();
    branchToStoreId.set(n, s.id);
    if (!n.endsWith("店")) branchToStoreId.set(`${n}店`, s.id);
  }

  const extraStoreIds = new Set<string>();
  for (const adj of adjustments) {
    if (adj.storeId) extraStoreIds.add(adj.storeId);
  }
  for (const d of dispatches) {
    extraStoreIds.add(d.toStoreId);
    if (d.fromStoreId) extraStoreIds.add(d.fromStoreId);
  }
  for (const ded of deductions) {
    extraStoreIds.add(ded.storeId);
  }
  const missingIds = [...extraStoreIds].filter((id) => !storeNameById.has(id));
  if (missingIds.length > 0) {
    const [perfStores, retailStores] = await Promise.all([
      prisma.store.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, name: true },
      }),
      prisma.retailStore.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, storeName: true },
      }),
    ]);
    for (const s of perfStores) storeNameById.set(s.id, s.name);
    for (const r of retailStores) {
      if (!storeNameById.has(r.id)) storeNameById.set(r.id, r.storeName);
    }
  }

  const fallbackHome = new Map<string, string>();
  for (const a of attendances) {
    if (a.originalStoreId && !fallbackHome.has(a.employeeId)) {
      fallbackHome.set(a.employeeId, a.originalStoreId);
    }
  }

  const dailyTotals = await mapWithConcurrency(days, DAY_CONCURRENCY, async (ymd) => {
    const d = parseDateOnlyUTC(ymd);
    const [totalByStore, overtimeByStore] = await Promise.all([
      computeTotalWorkHoursByStore(d),
      computeStoreOvertimeHoursByStore(d),
    ]);
    return { ymd, totalByStore, overtimeByStore };
  });

  const storeAgg = new Map<
    string,
    { storeId: string; storeName: string; totalHours: number; overtimeHours: number; employees: Set<string> }
  >();

  for (const s of filterStores) {
    storeAgg.set(s.id, {
      storeId: s.id,
      storeName: s.storeName,
      totalHours: 0,
      overtimeHours: 0,
      employees: new Set(),
    });
  }

  let totalHoursAll = 0;
  let totalOvertimeAll = 0;

  for (const day of dailyTotals) {
    for (const [storeId, hours] of Object.entries(day.totalByStore)) {
      if (!storeNameById.has(storeId)) continue;
      if (input.storeId && storeId !== input.storeId) continue;
      const row = storeAgg.get(storeId);
      if (!row) continue;
      row.totalHours += hours;
      totalHoursAll += hours;
    }
    for (const [storeId, ot] of Object.entries(day.overtimeByStore)) {
      if (!storeNameById.has(storeId)) continue;
      if (input.storeId && storeId !== input.storeId) continue;
      const row = storeAgg.get(storeId);
      if (!row) continue;
      row.overtimeHours += ot;
      totalOvertimeAll += ot;
    }
  }

  const employeeIdsInScope = new Set<string>();
  for (const a of attendances) {
    if (!isYmdInRange(workDateYmd(a.workDate), startYmd, endYmd)) continue;
    const sid = homeStoreId(a, fallbackHome);
    if (!sid || !storeNameById.has(sid)) continue;
    if (input.storeId && sid !== input.storeId) continue;
    if (Number(a.workHours) > 0) {
      employeeIdsInScope.add(a.employeeId);
      storeAgg.get(sid)?.employees.add(a.employeeId);
    }
  }

  const totalRegular = Math.max(0, totalHoursAll - totalOvertimeAll);
  const employeeCount = employeeIdsInScope.size;

  type AnomalyRow = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    storeId: string;
    storeName: string;
    types: string[];
    detail: string;
  };

  const anomalyByEmployee = new Map<string, AnomalyRow>();
  const bumpAnomaly = (
    employeeId: string,
    base: Omit<AnomalyRow, "types" | "detail">,
    type: string,
    detail: string
  ) => {
    let row = anomalyByEmployee.get(employeeId);
    if (!row) {
      row = { ...base, types: [], detail: "" };
      anomalyByEmployee.set(employeeId, row);
    }
    if (!row.types.includes(type)) row.types.push(type);
    row.detail = row.detail ? `${row.detail}；${detail}` : detail;
  };

  const overtimeByEmployee = new Map<string, number>();
  const mismatchDetailsByEmployee = new Map<string, string[]>();
  const shortageByEmployee = new Map<string, number>();

  for (const a of attendances) {
    if (!isYmdInRange(workDateYmd(a.workDate), startYmd, endYmd)) continue;
    const sid = homeStoreId(a, fallbackHome);
    if (!sid || !storeNameById.has(sid)) continue;
    if (input.storeId && sid !== input.storeId) continue;

    const wh = Number(a.workHours);
    const scheduled =
      a.scheduledWorkHours != null ? Number(a.scheduledWorkHours) : null;
    const base = {
      employeeId: a.employeeId,
      employeeName: a.employee.name,
      employeeCode: a.employee.employeeCode,
      storeId: sid,
      storeName: storeNameById.get(sid) ?? sid,
    };

    const scheduledHours = resolveScheduledHours(a);
    const ot = scheduledHours != null ? Math.max(0, wh - scheduledHours) : 0;
    if (ot > 0) {
      overtimeByEmployee.set(a.employeeId, (overtimeByEmployee.get(a.employeeId) ?? 0) + ot);
    }

    const status = String(a.locationMatchStatus ?? "UNKNOWN");
    if (status.startsWith("MISMATCH") || status === "NEED_REVIEW") {
      // 打卡門市名稱含本店名稱（如「宜蘭區-五結店」vs「五結店」）→ 同店不同文字格式，非真正跨店，跳過
      const homeStoreName = normalizeStoreName(storeNameById.get(sid) ?? "");
      const clockText = normalizeStoreName(
        a.clockInStoreText?.trim() || a.clockOutStoreText?.trim() || ""
      );
      const clockId = a.clockInStoreId ?? a.clockOutStoreId;
      const isSameStore =
        (clockId != null && clockId === sid) ||
        (homeStoreName.length >= 2 && clockText.length >= 2 &&
          (clockText.includes(homeStoreName) || homeStoreName.includes(clockText)));
      if (!isSameStore) {
        const detail = describeClockAnomalyDetail(a, dispatchByEmpDate, storeNameById);
        const prev = mismatchDetailsByEmployee.get(a.employeeId) ?? [];
        if (!prev.includes(detail)) {
          mismatchDetailsByEmployee.set(a.employeeId, [...prev, detail]);
        }
      }
    }

    if (wh <= 0 && scheduled != null && scheduled > 0) {
      bumpAnomaly(a.employeeId, base, "缺勤異常", `${workDateYmd(a.workDate)} 表定 ${scheduled}h 實際 0h`);
    } else if (isLeaveShift(a.shiftType, scheduled, wh) && wh <= 0) {
      bumpAnomaly(a.employeeId, base, "缺勤異常", `${workDateYmd(a.workDate)} 請假/未到`);
    }

    if (scheduled != null && scheduled > 0 && wh > 0 && wh < scheduled * 0.5) {
      shortageByEmployee.set(
        a.employeeId,
        (shortageByEmployee.get(a.employeeId) ?? 0) + (scheduled - wh)
      );
    }
  }

  type MonthlyOvertimeRow = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    storeId: string;
    storeName: string;
    overtimeHours: number;
    alertRatioPct: number;
  };

  const monthlyOvertime: MonthlyOvertimeRow[] = [];
  for (const [eid, ot] of overtimeByEmployee) {
    if (ot <= 0) continue;
    const a = attendances.find((x) => x.employeeId === eid);
    if (!a) continue;
    const sid = homeStoreId(a, fallbackHome);
    if (!sid || !storeNameById.has(sid)) continue;
    if (!isDualRegionStore(sid)) continue;
    if (input.storeId && sid !== input.storeId) continue;
    monthlyOvertime.push({
      employeeId: eid,
      employeeName: a.employee.name,
      employeeCode: a.employee.employeeCode,
      storeId: sid,
      storeName: resolveStoreName(sid),
      overtimeHours: Math.round(ot * 10) / 10,
      alertRatioPct: Math.round((ot / 46) * 1000) / 10,
    });
  }
  monthlyOvertime.sort((a, b) => b.overtimeHours - a.overtimeHours);

  for (const [eid, ot] of overtimeByEmployee) {
    if (ot > 12) {
      const a = attendances.find((x) => x.employeeId === eid);
      if (!a) continue;
      const sid = homeStoreId(a, fallbackHome);
      if (!sid) continue;
      bumpAnomaly(
        eid,
        {
          employeeId: eid,
          employeeName: a.employee.name,
          employeeCode: a.employee.employeeCode,
          storeId: sid,
          storeName: storeNameById.get(sid) ?? sid,
        },
        "加班過多",
        `月加班 ${ot.toFixed(1)}h`
      );
    }
  }

  for (const [eid, details] of mismatchDetailsByEmployee) {
    if (details.length < 3) continue;
    const a = attendances.find((x) => x.employeeId === eid);
    if (!a) continue;
    const sid = homeStoreId(a, fallbackHome);
    if (!sid) continue;
    bumpAnomaly(
      eid,
      {
        employeeId: eid,
        employeeName: a.employee.name,
        employeeCode: a.employee.employeeCode,
        storeId: sid,
        storeName: storeNameById.get(sid) ?? sid,
      },
      "打卡異常",
      details.join("、")
    );
  }

  for (const [eid, gap] of shortageByEmployee) {
    if (gap >= 8) {
      const a = attendances.find((x) => x.employeeId === eid);
      if (!a) continue;
      const sid = homeStoreId(a, fallbackHome);
      if (!sid) continue;
      bumpAnomaly(
        eid,
        {
          employeeId: eid,
          employeeName: a.employee.name,
          employeeCode: a.employee.employeeCode,
          storeId: sid,
          storeName: storeNameById.get(sid) ?? sid,
        },
        "工時不足",
        `月累計少 ${gap.toFixed(1)}h`
      );
    }
  }

  const anomalyList = [...anomalyByEmployee.values()].filter((r) =>
    isDualRegionStore(r.storeId)
  );
  const storeIdsWithAnomaly = new Set(anomalyList.map((r) => r.storeId));

  type EmployeeSummaryRow = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    storeId: string;
    storeName: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
  };

  const totalHoursByEmployee = new Map<string, number>();
  const employeeMeta = new Map<
    string,
    Omit<EmployeeSummaryRow, "totalHours" | "regularHours" | "overtimeHours">
  >();
  for (const a of attendances) {
    if (!isYmdInRange(workDateYmd(a.workDate), startYmd, endYmd)) continue;
    const sid = homeStoreId(a, fallbackHome);
    if (!sid || !storeNameById.has(sid)) continue;
    if (input.storeId && sid !== input.storeId) continue;
    const wh = Number(a.workHours);
    if (wh <= 0 || !employeeIdsInScope.has(a.employeeId)) continue;
    if (!employeeMeta.has(a.employeeId)) {
      employeeMeta.set(a.employeeId, {
        employeeId: a.employeeId,
        employeeName: a.employee.name,
        employeeCode: a.employee.employeeCode,
        storeId: sid,
        storeName: storeNameById.get(sid) ?? sid,
      });
    }
    totalHoursByEmployee.set(
      a.employeeId,
      (totalHoursByEmployee.get(a.employeeId) ?? 0) + wh
    );
  }

  const employeeSummary: EmployeeSummaryRow[] = [...employeeMeta.values()]
    .map((base) => {
      const totalRaw = totalHoursByEmployee.get(base.employeeId) ?? 0;
      const ot = overtimeByEmployee.get(base.employeeId) ?? 0;
      return {
        ...base,
        totalHours: Math.round(totalRaw * 10) / 10,
        overtimeHours: Math.round(ot * 10) / 10,
        regularHours: Math.round(Math.max(0, totalRaw - ot) * 10) / 10,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours);
  const anomalyCounts = {
    excessiveOvertime: anomalyList.filter((r) => r.types.includes("加班過多")).length,
    absence: anomalyList.filter((r) => r.types.includes("缺勤異常")).length,
    clockAnomaly: anomalyList.filter((r) => r.types.includes("打卡異常")).length,
    insufficient: anomalyList.filter((r) => r.types.includes("工時不足")).length,
  };

  const storeSummary = [...storeAgg.values()]
    .filter((s) => !input.storeId || s.storeId === input.storeId)
    .filter((s) => s.totalHours > 0 || s.overtimeHours > 0 || s.employees.size > 0)
    .map((s) => ({
      storeId: s.storeId,
      storeName: s.storeName,
      headcount: s.employees.size,
      totalHours: Math.round(s.totalHours * 10) / 10,
      regularHours: Math.round(Math.max(0, s.totalHours - s.overtimeHours) * 10) / 10,
      overtimeHours: Math.round(s.overtimeHours * 10) / 10,
      hasAnomaly: storeIdsWithAnomaly.has(s.storeId),
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  type AdjustmentRow = {
    id: string;
    workDate: string;
    category: string;
    storeId: string | null;
    storeName: string;
    employeeName: string;
    employeeCode: string;
    hours: number;
    note: string | null;
  };

  const adjustmentRows: AdjustmentRow[] = [];

  for (const d of dispatches) {
    const ymd = workDateYmd(d.workDate);
    if (!isYmdInRange(ymd, startYmd, endYmd)) continue;
    const hours = Number(d.actualHours ?? d.dispatchHours ?? 0);
    if (hours === 0) continue;
    if (input.storeId && d.fromStoreId !== input.storeId && d.toStoreId !== input.storeId) {
      continue;
    }
    adjustmentRows.push({
      id: d.id,
      workDate: ymd,
      category: "人力支援",
      storeId: d.toStoreId,
      storeName: resolveStoreName(d.toStoreId),
      employeeName: d.employee.name,
      employeeCode: d.employee.employeeCode,
      hours: Math.round(hours * 100) / 100,
      note: d.remark,
    });
    if (d.fromStoreId) {
      adjustmentRows.push({
        id: `${d.id}-out`,
        workDate: ymd,
        category: "人力支援（調出）",
        storeId: d.fromStoreId,
        storeName: resolveStoreName(d.fromStoreId),
        employeeName: d.employee.name,
        employeeCode: d.employee.employeeCode,
        hours: -Math.round(hours * 100) / 100,
        note: d.remark,
      });
    }
  }

  for (const adj of adjustments) {
    const ymd = workDateYmd(adj.workDate);
    if (!isYmdInRange(ymd, startYmd, endYmd)) continue;
    if (input.storeId && adj.storeId && adj.storeId !== input.storeId) continue;
    const label = ADJUSTMENT_LABELS[adj.adjustmentType] ?? adj.adjustmentType;
    const category =
      adj.adjustmentType === "RESERVE_STAFF" ? "儲備人力" : label;
    adjustmentRows.push({
      id: adj.id,
      workDate: ymd,
      category,
      storeId: adj.storeId,
      storeName: resolveStoreName(adj.storeId),
      employeeName: adj.employee.name,
      employeeCode: adj.employee.employeeCode,
      hours: Math.round(Number(adj.adjustmentHours) * 100) / 100,
      note: adj.note ?? adj.reason,
    });
  }

  for (const ded of deductions) {
    const ymd = workDateYmd(ded.workDate);
    if (!isYmdInRange(ymd, startYmd, endYmd)) continue;
    if (input.storeId && ded.storeId !== input.storeId) continue;
    const reason = DEDUCTION_LABELS[ded.reason] ?? ded.reason;
    const category =
      ded.reason === "CLEANING" || ded.reason === "INVENTORY_REGISTRATION" ?
        `${reason}時數扣除`
      : `${reason}扣除`;
    adjustmentRows.push({
      id: ded.id,
      workDate: ymd,
      category,
      storeId: ded.storeId,
      storeName: ded.store.name,
      employeeName: "—",
      employeeCode: "—",
      hours: -Math.round(Number(ded.hours) * 100) / 100,
      note: ded.note,
    });
  }

  for (const ce of contentEntries) {
    const ymd = workDateYmd(ce.workDate);
    if (!isYmdInRange(ymd, startYmd, endYmd)) continue;
    const key = ce.branch.trim();
    const sid =
      branchToStoreId.get(key) ?? branchToStoreId.get(key.replace(/店$/, ""));
    if (input.storeId && sid !== input.storeId) continue;
    const hours = Number(ce.deductedMinutes ?? 0) / 60;
    if (hours <= 0) continue;
    adjustmentRows.push({
      id: ce.id,
      workDate: ymd,
      category: "現貨文時數扣除",
      storeId: sid ?? null,
      storeName: sid ? resolveStoreName(sid, ce.branch) : ce.branch.trim() || "—",
      employeeName: "—",
      employeeCode: "—",
      hours: -Math.round(hours * 100) / 100,
      note: null,
    });
  }

  adjustmentRows.sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.category.localeCompare(b.category)
  );
  for (const row of adjustmentRows) {
    row.workDate = formatMonthDayLabel(row.workDate);
  }

  const addHours = adjustmentRows.filter((r) => r.hours > 0).reduce((a, r) => a + r.hours, 0);
  const deductHours = adjustmentRows
    .filter((r) => r.hours < 0)
    .reduce((a, r) => a + Math.abs(r.hours), 0);

  let storeTarget: { laborHourTarget: { toNumber(): number } } | null = null;
  if (input.storeId) {
    const hrName = filterStores.find((s) => s.id === input.storeId)?.storeName ?? null;
    if (hrName) {
      const allRetail = await prisma.retailStore.findMany({
        where: { isActive: true },
        select: { id: true, storeName: true, region: true },
      });
      const matched = resolveRetailStore(normalizeStoreKey(hrName), hrName, allRetail);
      if (matched) {
        storeTarget = await prisma.storeTarget.findUnique({
          where: { storeId_year_month: { storeId: matched.id, year: input.year, month: input.month } },
          select: { laborHourTarget: true },
        });
      }
    }
  }

  return {
    year: input.year,
    month: input.month,
    startDate: startYmd,
    endDate: endYmd,
    storeId: input.storeId ?? null,
    stores: filterStores,
    laborHourTarget: storeTarget ? Number(storeTarget.laborHourTarget) : null,
    overview: {
      totalRegularHours: Math.round(totalRegular * 10) / 10,
      totalOvertimeHours: Math.round(totalOvertimeAll * 10) / 10,
      employeeCount,
      anomalyPersonCount: anomalyList.length,
      storeSummary,
    },
    employeeSummary,
    anomalies: {
      counts: anomalyCounts,
      list: anomalyList,
      monthlyOvertime,
    },
    adjustments: {
      recordCount: adjustmentRows.length,
      addHours: Math.round(addHours * 10) / 10,
      deductHours: Math.round(deductHours * 10) / 10,
      rows: adjustmentRows,
    },
  };
}

function normalizeStoreName(s: string): string {
  return s.trim().replace(/店$/, "");
}

/** 去掉「XX區-」前綴，保留純門市名稱（如「宜蘭區-中正店」→「中正店」） */
function stripRegionPrefix(s: string): string {
  return s.replace(/^[一-鿿][一-鿿]*區-/, "");
}

export async function buildWorkHoursCalendar(input: {
  storeId: string; // HR Store ID (from listPerformanceStoresForFilter / dashboard meta.stores)
  year: number;
  month: number;
}) {
  const { startYmd, endYmd } = resolveMonthRange(input.year, input.month);
  const days = listDaysInRange(startYmd, endYmd);
  const workDates = days.map((ymd) => parseDateOnlyUTC(ymd));

  // Map HR Store → RetailStore via name matching
  const [hrStore, allRetailStores, holidays] = await Promise.all([
    prisma.store.findUnique({ where: { id: input.storeId }, select: { name: true } }),
    prisma.retailStore.findMany({ where: { isActive: true }, select: { id: true, storeName: true, region: true } }),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: parseDateOnlyUTC(startYmd), lte: parseDateOnlyUTC(endYmd) },
      },
      select: { date: true, name: true },
    }),
  ]);
  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    holidayMap.set(formatDateOnly(h.date), h.name);
  }
  if (!hrStore) throw new Error(`Store ${input.storeId} not found`);

  const retailStore = resolveRetailStore(normalizeStoreKey(hrStore.name), hrStore.name, allRetailStores);
  const storeName = hrStore.name;

  const emptyDays = days.map((date) => ({
    date,
    weekday: parseDateOnlyUTC(date).getUTCDay(),
    holiday: holidayMap.get(date) ?? null,
    staff: [] as { name: string; workHours: number; startTime: string; endTime: string; homeStore: string | null; isSupport: boolean; outgoingTo: string | null }[],
    efficiencyRatio: null as number | null,
    isAchieved: false,
    hasData: false,
  }));

  if (!retailStore) {
    return { storeId: input.storeId, storeName, year: input.year, month: input.month, startDate: startYmd, endDate: endYmd, days: emptyDays, employeeAchievement: [] };
  }

  // 本店出勤：employee.defaultStoreId = input.storeId (HR Store ID)
  // 跨店支援：DispatchRecord.toStoreId = input.storeId，再撈其 AttendanceRecord
  // 工效比：與每日工效比報表相同公式（prefetch 預載整月）
  const [homeAtts, dispatches, prefetch] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        workDate: { in: workDates },
        workHours: { gt: 0 },
        OR: [
          { employee: { defaultStoreId: input.storeId } },
          { originalStoreId: input.storeId },
        ],
      },
      select: {
        workDate: true,
        workHours: true,
        startTime: true,
        endTime: true,
        department: true,
        employeeId: true,
        employee: { select: { name: true, defaultStoreId: true } },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    }),
    prisma.dispatchRecord.findMany({
      where: { toStoreId: input.storeId, workDate: { in: workDates } },
      select: {
        workDate: true,
        startTime: true,
        endTime: true,
        actualHours: true,
        dispatchHours: true,
        employee: { select: { id: true, name: true, defaultStoreId: true } },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    }),
    buildRangeDailyMetricsPrefetch(startYmd, endYmd),
  ]);

  // 本店人員調出到他店，兩種情況都要涵蓋：
  // 1. homeAtts 員工（originalStoreId 或 defaultStoreId 確認為本店）→ 建立調度時 fromStoreId 可能為 null
  // 2. fromStoreId 明確設為本店（即使該員工本月無本店出勤記錄）
  const homeEmployeeIds = [...new Set(homeAtts.map((a) => a.employeeId))];
  const outgoingOrConditions: object[] = [{ fromStoreId: input.storeId }];
  if (homeEmployeeIds.length > 0) outgoingOrConditions.push({ employeeId: { in: homeEmployeeIds } });
  const outgoingDispatches = await prisma.dispatchRecord.findMany({
    where: {
      workDate: { in: workDates },
      toStoreId: { not: input.storeId },
      OR: outgoingOrConditions,
    },
    select: {
      workDate: true,
      employeeId: true,
      toStoreId: true,
    },
  });

  // 解析調出目標門市名稱
  const outgoingToStoreIds = [...new Set(outgoingDispatches.map((d) => d.toStoreId))];
  const outgoingStoreNameById = new Map<string, string>();
  if (outgoingToStoreIds.length > 0) {
    const targetStores = await prisma.store.findMany({
      where: { id: { in: outgoingToStoreIds } },
      select: { id: true, name: true },
    });
    for (const s of targetStores) outgoingStoreNameById.set(s.id, stripRegionPrefix(s.name));
  }
  // empId|ymd → 目標門市名稱（如「北成」）
  const outgoingByEmpDate = new Map<string, string>();
  for (const d of outgoingDispatches) {
    const ymd = workDateYmd(d.workDate);
    const name = outgoingStoreNameById.get(d.toStoreId);
    if (name) outgoingByEmpDate.set(`${d.employeeId}|${ymd}`, name);
  }

  // 扣工時來源：StoreHourDeduction / ContentEntry / WorkhourAdjustment
  const storeNameNorm = normalizeStoreName(hrStore.name);
  const [storeDeductions, contentEntries, workhourAdjs] = await Promise.all([
    prisma.storeHourDeduction.findMany({
      where: { storeId: input.storeId, workDate: { in: workDates } },
      select: { workDate: true, reason: true, hours: true, note: true },
    }),
    prisma.contentEntry.findMany({
      where: { workDate: { in: workDates }, deductedMinutes: { gt: 0 } },
      select: { workDate: true, branch: true, deductedMinutes: true },
    }),
    prisma.workhourAdjustment.findMany({
      where: {
        workDate: { in: workDates },
        storeId: input.storeId,
        adjustmentHours: { lt: 0 },
      },
      select: {
        workDate: true,
        adjustmentType: true,
        adjustmentHours: true,
        note: true,
        employee: { select: { name: true } },
      },
    }),
  ]);

  // ContentEntry 過濾出屬於本店的（branch 名稱比對）
  const storeContentEntries = contentEntries.filter(
    (e) => normalizeStoreName(e.branch) === storeNameNorm
  );

  const DEDUCTION_REASON_LABEL: Record<string, string> = {
    EXPIRY: "效期",
    CLEANING: "清掃",
    INVENTORY_REGISTRATION: "現貨文登記",
    OTHER: "其他",
  };
  const ADJUSTMENT_TYPE_LABEL: Record<string, string> = {
    STAFF_SHORTAGE: "人力不足",
    MEETING_REVIEW: "會議/考核",
    RESERVE_STAFF: "儲備人力",
    TRIAL: "試作",
    MANAGER_MEETING: "店長會議",
    PROMOTION_REVIEW: "晉升考核",
    OTHER: "其他",
  };

  // 撈跨店支援人員的出勤紀錄（取 department 用於顯示所屬門市名稱）
  const dispatchEmpIds = [...new Set(dispatches.map((d) => d.employee.id))];
  const supportAttMap = new Map<string, Map<string, { department: string | null }>>();
  if (dispatchEmpIds.length > 0) {
    const suppAtts = await prisma.attendanceRecord.findMany({
      where: { employeeId: { in: dispatchEmpIds }, workDate: { in: workDates } },
      select: { workDate: true, department: true, employeeId: true },
    });
    for (const sa of suppAtts) {
      const ymd = workDateYmd(sa.workDate);
      if (!supportAttMap.has(sa.employeeId)) supportAttMap.set(sa.employeeId, new Map());
      supportAttMap.get(sa.employeeId)!.set(ymd, { department: sa.department ?? null });
    }
  }

  // 取得 HR Store 名稱，作為判斷跨店的基準
  const homeStoreName = hrStore.name;

  // 與每日工效比報表相同公式：逐日計算工效比與達標狀態
  // 門檻：平日(一~五) ≥ 4,000、週六 ≥ 5,500（與 isEfficiencyTargetMet 一致）
  type DayEff = { ratio: number | null; isAchieved: boolean };
  const dateToEff = new Map<string, DayEff>();
  await Promise.all(
    days.map(async (ymd) => {
      const workDate = parseDateOnlyUTC(ymd);
      const metrics = await computeDailyMetricsByStoreResilientWithPrefetch(workDate, prefetch);
      const m = metrics.get(input.storeId);
      const laborH = m?.laborHours ?? 0;
      const revenue = m?.revenue ?? 0;
      const ratio = laborH > 0 ? Math.round(revenue / laborH) : null;
      dateToEff.set(ymd, { ratio, isAchieved: isEfficiencyTargetMet(ymd, ratio) });
    })
  );

  // 建立每日扣工時索引
  type DeductionItem = { label: string; hours: number; note?: string | null };
  const deductionsByDate = new Map<string, DeductionItem[]>();
  const pushDeduction = (ymd: string, item: DeductionItem) => {
    if (!deductionsByDate.has(ymd)) deductionsByDate.set(ymd, []);
    deductionsByDate.get(ymd)!.push(item);
  };
  for (const d of storeDeductions) {
    const ymd = workDateYmd(d.workDate);
    pushDeduction(ymd, {
      label: DEDUCTION_REASON_LABEL[d.reason] ?? d.reason,
      hours: Math.round(Number(d.hours) * 100) / 100,
      note: d.note,
    });
  }
  for (const ce of storeContentEntries) {
    const ymd = workDateYmd(ce.workDate);
    const hours = Math.round((Number(ce.deductedMinutes ?? 0) / 60) * 100) / 100;
    if (hours > 0) {
      pushDeduction(ymd, { label: "現貨文", hours });
    }
  }
  for (const adj of workhourAdjs) {
    const ymd = workDateYmd(adj.workDate);
    pushDeduction(ymd, {
      label: ADJUSTMENT_TYPE_LABEL[adj.adjustmentType] ?? adj.adjustmentType,
      hours: Math.abs(Math.round(Number(adj.adjustmentHours) * 100) / 100),
      note: adj.note ?? (adj.employee ? adj.employee.name : null),
    });
  }

  const calendarDays = days.map((ymd) => {
    const dow = parseDateOnlyUTC(ymd).getUTCDay();
    const eff = dateToEff.get(ymd) ?? { ratio: null, isAchieved: false };

    // 本店人員（若當日有調出到他店，標記 outgoingTo）
    const homeStaff = homeAtts
      .filter((a) => workDateYmd(a.workDate) === ymd)
      .map((a) => {
        const outTarget = outgoingByEmpDate.get(`${a.employeeId}|${ymd}`) ?? null;
        return {
          name: a.employee.name,
          workHours: Number(a.workHours),
          startTime: a.startTime ?? "",
          endTime: a.endTime ?? "",
          homeStore: stripRegionPrefix(a.department ?? homeStoreName),
          isSupport: false,
          outgoingTo: outTarget,
        };
      });

    // 跨店支援（過濾掉本店人員已包含的）
    const homeNames = new Set(homeStaff.map((s) => s.name));
    const supportStaff = dispatches
      .filter((d) => workDateYmd(d.workDate) === ymd && !homeNames.has(d.employee.name))
      .map((d) => {
        const sa = supportAttMap.get(d.employee.id)?.get(ymd);
        return {
          name: d.employee.name,
          workHours: Number(d.actualHours ?? d.dispatchHours),
          startTime: d.startTime ?? "",
          endTime: d.endTime ?? "",
          homeStore: sa?.department ? stripRegionPrefix(sa.department) : null,
          isSupport: true,
          outgoingTo: null,
        };
      });

    return {
      date: ymd,
      weekday: dow,
      holiday: holidayMap.get(ymd) ?? null,
      staff: [...homeStaff, ...supportStaff],
      deductions: deductionsByDate.get(ymd) ?? [],
      efficiencyRatio: eff.ratio,
      isAchieved: eff.isAchieved,
      hasData: dateToEff.has(ymd),
    };
  });

  const empAgg = new Map<
    string,
    { attendanceDays: number; achievedDays: number; homeStore: string | null; isSupport: boolean }
  >();
  for (const day of calendarDays) {
    for (const s of day.staff) {
      const cur = empAgg.get(s.name);
      if (!cur) {
        empAgg.set(s.name, {
          attendanceDays: 1,
          achievedDays: day.isAchieved ? 1 : 0,
          homeStore: s.homeStore,
          isSupport: s.isSupport,
        });
      } else {
        cur.attendanceDays += 1;
        if (day.isAchieved) cur.achievedDays += 1;
      }
    }
  }

  const employeeAchievement = [...empAgg.entries()]
    .map(([name, agg]) => ({
      name,
      homeStore: agg.homeStore,
      isSupport: agg.isSupport,
      attendanceDays: agg.attendanceDays,
      achievedDays: agg.achievedDays,
      achieveRate: agg.attendanceDays > 0
        ? Math.round((agg.achievedDays / agg.attendanceDays) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => (a.isSupport ? 1 : -1) - (b.isSupport ? 1 : -1) || b.attendanceDays - a.attendanceDays);

  return {
    storeId: input.storeId,
    storeName: retailStore.storeName,
    year: input.year,
    month: input.month,
    startDate: startYmd,
    endDate: endYmd,
    days: calendarDays,
    employeeAchievement,
  };
}
