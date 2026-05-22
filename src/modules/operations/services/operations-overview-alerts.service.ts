import type { RevenueAchievementBucket } from "@/modules/operations/services/operations-overview-enrich.service";

export type OverviewStoreAlertInput = {
  storeId: string;
  storeName: string;
  region: string;
  revenue: number;
  laborHours: number;
  efficiencyRatio: number | null;
  revenueTarget: number | null;
  revenueAchievementRate: number | null;
  targetMetDays: number;
  status: RevenueAchievementBucket;
};

export type SupervisorPriorityAlert = {
  storeId: string;
  storeName: string;
  region: string;
  priorityScore: number;
  reasons: string[];
  revenue: number;
  revenueAchievementRate: number | null;
  efficiencyRatio: number | null;
  laborHours: number;
  targetMetDays: number;
  status: RevenueAchievementBucket;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ?
      (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const ACHIEVEMENT_WARN_PCT = 80;
const EFFICIENCY_LOW_RATIO = 0.85;
const LABOR_HIGH_RATIO = 1.2;

/**
 * 綜合營收達成率、工效比、總工時與同區門市中位數比較，產出督導優先留意清單。
 */
export function buildSupervisorPriorityAlerts(
  stores: OverviewStoreAlertInput[]
): SupervisorPriorityAlert[] {
  const active = stores.filter((s) => s.revenue > 0 || s.laborHours > 0);
  if (active.length === 0) return [];

  const efficiencies = active
    .map((s) => s.efficiencyRatio)
    .filter((n): n is number => n != null && n > 0);
  const laborList = active.map((s) => s.laborHours).filter((h) => h > 0);

  const medianEff = median(efficiencies);
  const medianLabor = median(laborList);

  const alerts: SupervisorPriorityAlert[] = [];

  for (const s of active) {
    const reasons: string[] = [];
    let score = 0;

    if (s.revenueAchievementRate != null) {
      if (s.revenueAchievementRate < 80) {
        reasons.push(`營收達成率 ${s.revenueAchievementRate.toFixed(1)}%（未達標）`);
        score += (100 - s.revenueAchievementRate) * 1.5;
      } else if (s.revenueAchievementRate < 100) {
        reasons.push(`營收達成率 ${s.revenueAchievementRate.toFixed(1)}%（接近達標）`);
        score += (100 - s.revenueAchievementRate) * 0.8;
      }
    } else if (s.revenueTarget == null || s.revenueTarget <= 0) {
      reasons.push("尚無月營收目標");
      score += 15;
    }

    if (
      s.efficiencyRatio != null &&
      medianEff > 0 &&
      s.efficiencyRatio < medianEff * EFFICIENCY_LOW_RATIO
    ) {
      reasons.push(
        `工效比偏低 ${Math.round(s.efficiencyRatio).toLocaleString("zh-TW")} 元/hr（區間中位數約 ${Math.round(medianEff).toLocaleString("zh-TW")}）`
      );
      score += 35 * (1 - s.efficiencyRatio / medianEff);
    }

    if (medianLabor > 0 && s.laborHours > medianLabor * LABOR_HIGH_RATIO) {
      reasons.push(
        `總工時偏高 ${s.laborHours.toFixed(1)} hr（區間中位數約 ${medianLabor.toFixed(1)} hr）`
      );
      score += 25 * (s.laborHours / medianLabor - 1);
    }

    if (s.status === "red") score += 20;
    else if (s.status === "yellow") score += 8;

    if (reasons.length === 0) continue;

    alerts.push({
      storeId: s.storeId,
      storeName: s.storeName,
      region: s.region,
      priorityScore: Math.round(score * 10) / 10,
      reasons,
      revenue: s.revenue,
      revenueAchievementRate: s.revenueAchievementRate,
      efficiencyRatio: s.efficiencyRatio,
      laborHours: s.laborHours,
      targetMetDays: s.targetMetDays,
      status: s.status,
    });
  }

  return alerts
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);
}

export function buildDualRegionRevenueShare(
  stores: Array<{ region: string; revenue: number }>
) {
  const taoyuan = stores
    .filter((s) => s.region === "桃園區")
    .reduce((a, s) => a + s.revenue, 0);
  const yilan = stores
    .filter((s) => s.region === "宜蘭區")
    .reduce((a, s) => a + s.revenue, 0);
  const total = taoyuan + yilan;
  return [
    {
      region: "桃園區",
      revenue: taoyuan,
      sharePct: total > 0 ? Math.round((taoyuan / total) * 1000) / 10 : 0,
    },
    {
      region: "宜蘭區",
      revenue: yilan,
      sharePct: total > 0 ? Math.round((yilan / total) * 1000) / 10 : 0,
    },
  ].filter((r) => r.revenue > 0 || total === 0);
}
