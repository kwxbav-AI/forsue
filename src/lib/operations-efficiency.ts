/** 門市工效比燈號（與每日工效比 isTargetMet 一致） */

export type StoreEfficiencyStatus = "green" | "yellow" | "red" | "none";

const WEEKDAY_TARGET = 4000;
const SATURDAY_TARGET = 5500;

export function efficiencyTargetForYmd(ymd: string): number {
  const dow = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
  return dow === 6 ? SATURDAY_TARGET : WEEKDAY_TARGET;
}

export function isEfficiencyTargetMet(ymd: string, efficiencyRatio: number | null): boolean {
  if (efficiencyRatio == null || efficiencyRatio <= 0) return false;
  return efficiencyRatio >= efficiencyTargetForYmd(ymd);
}

/** 達標 / 警示(≥80%門檻未達標) / 未達標 / 無資料 */
export function storeEfficiencyStatus(
  ymd: string,
  efficiencyRatio: number | null,
  hasActivity: boolean
): StoreEfficiencyStatus {
  if (!hasActivity || efficiencyRatio == null || efficiencyRatio <= 0) return "none";
  const target = efficiencyTargetForYmd(ymd);
  if (efficiencyRatio >= target) return "green";
  if (efficiencyRatio >= target * 0.8) return "yellow";
  return "red";
}

export const EFFICIENCY_STATUS_LABEL: Record<StoreEfficiencyStatus, string> = {
  green: "達標",
  yellow: "警示",
  red: "未達標",
  none: "無資料",
};
