import { prisma } from "@/lib/prisma";
import { toStartOfDay } from "@/lib/date";

/** 取得某日生效中的目標工效值；若無則回 null */
export async function getEffectiveTarget(date: Date): Promise<number | null> {
  const d = toStartOfDay(date);
  const setting = await prisma.performanceTargetSetting.findFirst({
    where: {
      isActive: true,
      effectiveStartDate: { lte: d },
      OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: d } }],
    },
    orderBy: { effectiveStartDate: "desc" },
  });
  return setting ? Number(setting.targetValue) : null;
}

/** 預設目標值（無設定時），僅供計算時使用，不寫死於達標判斷 */
export const DEFAULT_TARGET = 4000;

/** 取得某日用於計算的目標值（含預設） */
export async function getTargetForDate(date: Date): Promise<number> {
  const value = await getEffectiveTarget(date);
  return value ?? DEFAULT_TARGET;
}
