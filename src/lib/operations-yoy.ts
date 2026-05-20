/** 營收 YoY：(本期 - 去年同期) / 去年同期 × 100 */
export function yoyGrowthRate(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior <= 0) return null;
  if (!Number.isFinite(current)) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}
