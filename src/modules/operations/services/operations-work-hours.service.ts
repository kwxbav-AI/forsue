import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  toDateRange,
} from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import {
  computeStoreOvertimeHoursByStore,
  computeTotalWorkHoursByStore,
} from "@/modules/performance/services/attendance-allocation.service";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";
import { addCalendarDaysUTC } from "@/lib/date";

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

/** 與 DB @db.Date（UTC 日曆日）及上傳 toWorkDateUTC 一致 */
function workDateYmd(d: Date): string {
  return formatDateOnly(d);
}

function isYmdInRange(ymd: string, startYmd: string, endYmd: string): boolean {
  return ymd >= startYmd && ymd <= endYmd;
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

  // 勿用 toDateRangeTaipei：gte 帶 16:00 UTC 與 @db.Date 比對時會被截成前一日，誤含 4/30、3/30
  const { start, end } = toDateRange(startYmd, endYmd);

  const [attendances, dispatches, adjustments, deductions, contentEntries] =
    await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { workDate: { gte: start, lte: end } },
      include: { employee: { select: { id: true, name: true, employeeCode: true, defaultStoreId: true } } },
    }),
    prisma.dispatchRecord.findMany({
      where: { workDate: { gte: start, lte: end }, confirmStatus: "已確認" },
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    }),
    prisma.workhourAdjustment.findMany({
      where: { workDate: { gte: start, lte: end } },
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    }),
    prisma.storeHourDeduction.findMany({
      where: { workDate: { gte: start, lte: end } },
      include: { store: { select: { id: true, name: true } } },
    }),
    prisma.contentEntry.findMany({
      where: {
        workDate: { gte: start, lte: end },
        deductedMinutes: { not: null, gt: 0 },
      },
      select: { id: true, workDate: true, branch: true, deductedMinutes: true },
    }),
  ]);

  const branchToStoreId = new Map<string, string>();
  for (const s of filterStores) {
    const n = s.storeName.trim();
    branchToStoreId.set(n, s.id);
    if (!n.endsWith("店")) branchToStoreId.set(`${n}店`, s.id);
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
  const mismatchByEmployee = new Map<string, number>();
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

    const ot = Math.max(0, wh - 8);
    if (ot > 0) {
      overtimeByEmployee.set(a.employeeId, (overtimeByEmployee.get(a.employeeId) ?? 0) + ot);
    }

    const status = String(a.locationMatchStatus ?? "UNKNOWN");
    if (status.startsWith("MISMATCH") || status === "NEED_REVIEW") {
      mismatchByEmployee.set(a.employeeId, (mismatchByEmployee.get(a.employeeId) ?? 0) + 1);
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

  for (const [eid, cnt] of mismatchByEmployee) {
    if (cnt >= 3) {
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
        "遲到頻繁",
        `打卡地點異常 ${cnt} 次`
      );
    }
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

  const anomalyList = [...anomalyByEmployee.values()];
  const anomalyCounts = {
    excessiveOvertime: anomalyList.filter((r) => r.types.includes("加班過多")).length,
    absence: anomalyList.filter((r) => r.types.includes("缺勤異常")).length,
    lateFrequent: anomalyList.filter((r) => r.types.includes("遲到頻繁")).length,
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
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const rankingBase = storeSummary.filter((s) => s.headcount > 0);
  const companyAvgPerCapita =
    employeeCount > 0 ? totalHoursAll / employeeCount : null;

  const storeRanking = rankingBase
    .map((s) => {
      const perCapita = s.headcount > 0 ? s.totalHours / s.headcount : 0;
      const deviation =
        companyAvgPerCapita != null && companyAvgPerCapita > 0 ?
          ((perCapita - companyAvgPerCapita) / companyAvgPerCapita) * 100
        : null;
      return {
        ...s,
        perCapita: Math.round(perCapita * 10) / 10,
        deviationPct: deviation != null ? Math.round(deviation * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.perCapita - a.perCapita);

  const top = storeRanking[0];
  const bottom = storeRanking[storeRanking.length - 1];

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
      storeName: storeNameById.get(d.toStoreId) ?? d.toStoreId,
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
        storeName: storeNameById.get(d.fromStoreId) ?? d.fromStoreId,
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
      storeName: adj.storeId ? (storeNameById.get(adj.storeId) ?? adj.storeId) : "—",
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
      storeName: sid ? (storeNameById.get(sid) ?? ce.branch) : ce.branch,
      employeeName: "—",
      employeeCode: "—",
      hours: -Math.round(hours * 100) / 100,
      note: null,
    });
  }

  adjustmentRows.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.category.localeCompare(b.category));

  const addHours = adjustmentRows.filter((r) => r.hours > 0).reduce((a, r) => a + r.hours, 0);
  const deductHours = adjustmentRows
    .filter((r) => r.hours < 0)
    .reduce((a, r) => a + Math.abs(r.hours), 0);

  return {
    year: input.year,
    month: input.month,
    startDate: startYmd,
    endDate: endYmd,
    storeId: input.storeId ?? null,
    stores: filterStores,
    overview: {
      totalRegularHours: Math.round(totalRegular * 10) / 10,
      totalOvertimeHours: Math.round(totalOvertimeAll * 10) / 10,
      employeeCount,
      anomalyPersonCount: anomalyList.length,
      storeSummary,
    },
    anomalies: {
      counts: anomalyCounts,
      list: anomalyList,
    },
    perCapita: {
      companyAvgPerCapita:
        companyAvgPerCapita != null ? Math.round(companyAvgPerCapita * 10) / 10 : null,
      topStore: top ?
        { storeName: top.storeName, perCapita: top.perCapita }
      : null,
      bottomStore: bottom ?
        { storeName: bottom.storeName, perCapita: bottom.perCapita }
      : null,
      ranking: storeRanking,
    },
    adjustments: {
      recordCount: adjustmentRows.length,
      addHours: Math.round(addHours * 10) / 10,
      deductHours: Math.round(deductHours * 10) / 10,
      rows: adjustmentRows,
    },
  };
}
