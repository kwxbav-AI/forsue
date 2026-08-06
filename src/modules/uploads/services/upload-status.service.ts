import { prisma } from "@/lib/prisma";
import {
  addCalendarDaysUTC,
  endOfDayUTC,
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
} from "@/lib/date";

// 檢查視窗：往前看幾天（含 cutoff 當天）
const LOOKBACK_DAYS = 10;
// 寬限天數：今天上傳「昨天」的資料屬正常流程，不算未上傳。
// 例：今天 6 號，正在傳 5 號的資料 → 檢查到 4 號（6 - 2）為止。
const GRACE_DAYS = 2;

export type MissingUploadDate = {
  ymd: string;
  attendanceMissing: boolean;
  revenueMissingStores: string[];
};

export type MissingUploadWarning = {
  cutoffYmd: string;
  dates: MissingUploadDate[];
};

/**
 * 檢查最近幾天（排除今明兩天的正常上傳寬限期）是否有門市營收或出勤表尚未上傳。
 * 營收：逐店逐日檢查（新開門市於開幕前不算未上傳）。
 * 出勤：僅檢查當日是否完全沒有任何出勤紀錄（出勤表為全店合併上傳）。
 */
export async function getMissingUploadWarnings(): Promise<MissingUploadWarning> {
  const todayYmd = formatDateOnlyTaipei(new Date());
  const cutoffYmd = addCalendarDaysUTC(todayYmd, -GRACE_DAYS);
  const windowStartYmd = addCalendarDaysUTC(cutoffYmd, -(LOOKBACK_DAYS - 1));

  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: {
      id: true,
      name: true,
      newStoreSetting: { select: { openDate: true } },
    },
  });
  if (stores.length === 0) return { cutoffYmd, dates: [] };

  const windowStart = parseDateOnlyUTC(windowStartYmd);
  const windowEnd = endOfDayUTC(cutoffYmd);

  const [revenueRows, attendanceRows] = await Promise.all([
    prisma.revenueRecord.findMany({
      where: { revenueDate: { gte: windowStart, lte: windowEnd } },
      select: { storeId: true, revenueDate: true },
      distinct: ["storeId", "revenueDate"],
    }),
    prisma.attendanceRecord.findMany({
      where: { workDate: { gte: windowStart, lte: windowEnd } },
      select: { workDate: true },
      distinct: ["workDate"],
    }),
  ]);

  const revenueSet = new Set(
    revenueRows.map((r) => `${r.storeId}|${formatDateOnly(r.revenueDate)}`)
  );
  const attendanceSet = new Set(attendanceRows.map((r) => formatDateOnly(r.workDate)));

  const dates: MissingUploadDate[] = [];
  for (let ymd = windowStartYmd; ymd <= cutoffYmd; ymd = addCalendarDaysUTC(ymd, 1)) {
    const attendanceMissing = !attendanceSet.has(ymd);
    const revenueMissingStores = stores
      .filter((s) => !s.newStoreSetting || formatDateOnly(s.newStoreSetting.openDate) <= ymd)
      .filter((s) => !revenueSet.has(`${s.id}|${ymd}`))
      .map((s) => s.name);

    if (attendanceMissing || revenueMissingStores.length > 0) {
      dates.push({ ymd, attendanceMissing, revenueMissingStores });
    }
  }

  return { cutoffYmd, dates };
}
