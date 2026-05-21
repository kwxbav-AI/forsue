import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";

export type TargetSummaryRow = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  totalDays: number;
  metDays: number;
  notMetDays: number;
  metRate: number;
  avgEfficiencyRatio: number;
};

/** 選定區間內（含起訖）排除週日與假日後的工作日天數 */
export function countWorkingDaysInRangeUTC(
  startYmd: string,
  endYmd: string,
  holidayYmdSet: Set<string>
): number {
  return listWorkingDatesInRangeUTC(startYmd, endYmd, holidayYmdSet).length;
}

/** 區間內每個工作日的 UTC Date（供 Prisma `workDate: { in }` 篩選） */
export function listWorkingDatesInRangeUTC(
  startYmd: string,
  endYmd: string,
  holidayYmdSet: Set<string>
): Date[] {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    if (d.getUTCDay() === 0) continue;
    if (holidayYmdSet.has(ymd)) continue;
    out.push(d);
  }
  return out;
}

export async function loadHolidayYmdSet(
  startYmd: string,
  endYmd: string
): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: {
        gte: parseDateOnlyUTC(startYmd),
        lte: parseDateOnlyUTC(endYmd),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => formatDateOnly(h.date)));
}

const performanceDailyStoreFilter = (storeId?: string) => ({
  isActive: true,
  hideInReports: false as boolean,
  ...(storeId ? { id: storeId } : {}),
});

/**
 * 達標次數統計：以 groupBy 彙總各門市（排除週日／假日），避免載入全量逐日列。
 */
export async function buildTargetSummaryReport(input: {
  startDate: string;
  endDate: string;
  storeId?: string;
}): Promise<TargetSummaryRow[]> {
  const { startDate, endDate, storeId } = input;
  const holidaySet = await loadHolidayYmdSet(startDate, endDate);
  const workingDates = listWorkingDatesInRangeUTC(startDate, endDate, holidaySet);
  const workingDaysInPeriod = workingDates.length;

  if (workingDaysInPeriod === 0) {
    return [];
  }

  const baseWhere = {
    workDate: { in: workingDates },
    versionNo: 1,
    store: performanceDailyStoreFilter(storeId),
    ...(storeId ? { storeId } : {}),
  };

  const [statsGrouped, metGrouped] = await Promise.all([
    prisma.performanceDaily.groupBy({
      by: ["storeId"],
      where: baseWhere,
      _sum: {
        revenueAmount: true,
        totalWorkHours: true,
        efficiencyRatio: true,
      },
      _count: { _all: true },
    }),
    prisma.performanceDaily.groupBy({
      by: ["storeId"],
      where: { ...baseWhere, isTargetMet: true },
      _count: { _all: true },
    }),
  ]);

  if (statsGrouped.length === 0) {
    return [];
  }

  const metByStore = new Map(
    metGrouped.map((g) => [g.storeId, g._count._all])
  );

  const stores = await prisma.store.findMany({
    where: { id: { in: statsGrouped.map((g) => g.storeId) } },
    select: { id: true, name: true, code: true },
  });
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const result: TargetSummaryRow[] = statsGrouped.map((g) => {
    const store = storeById.get(g.storeId);
    const dataDays = g._count._all;
    const metDays = metByStore.get(g.storeId) ?? 0;
    const sumRatio = Number(g._sum.efficiencyRatio ?? 0);

    return {
      storeId: g.storeId,
      storeName: store?.name ?? "",
      storeCode: store?.code ?? null,
      totalDays: workingDaysInPeriod,
      metDays,
      notMetDays: workingDaysInPeriod - metDays,
      metRate: workingDaysInPeriod > 0 ? metDays / workingDaysInPeriod : 0,
      avgEfficiencyRatio: dataDays > 0 ? sumRatio / dataDays : 0,
    };
  });

  result.sort((a, b) => b.metRate - a.metRate);
  return result;
}

/** 區間內各門市工效比達標天數（排除週日與假日，與達標次數統計一致） */
export async function countTargetMetDaysByStore(
  startYmd: string,
  endYmd: string,
  storeIds?: string[]
): Promise<Map<string, number>> {
  const holidaySet = await loadHolidayYmdSet(startYmd, endYmd);
  const workingDates = listWorkingDatesInRangeUTC(startYmd, endYmd, holidaySet);

  if (workingDates.length === 0) {
    return new Map();
  }

  const grouped = await prisma.performanceDaily.groupBy({
    by: ["storeId"],
    where: {
      workDate: { in: workingDates },
      versionNo: 1,
      isTargetMet: true,
      ...(storeIds?.length ? { storeId: { in: storeIds } } : {}),
      store: { isActive: true },
    },
    _count: { _all: true },
  });

  return new Map(grouped.map((g) => [g.storeId, g._count._all]));
}
