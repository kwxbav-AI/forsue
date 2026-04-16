/**
 * 依「商品數量」與「留言數量」計算單篇扣工時（分鐘）
 * 【單篇 1~5 個品項】留言≤20 40分, 21~40 60分, 41~60 80分, 留言>61 100分
 * 【單篇 6~10 個品項】留言≤20 60分, 21~40 80分, 41~60 100分, 留言≥61 120分
 * 【單篇 11~24 個品項】留言≤10 90分(1.5h), 11-39 120分(2h), 40-60 150分(2.5h), >60 180分(3h)
 */
export function deductMinutesPerArticle(
  productCount: number,
  commentCount: number
): number {
  const p = Math.max(0, Math.floor(Number(productCount)) || 0);
  const c = Math.max(0, Math.floor(Number(commentCount)) || 0);

  if (p <= 5) {
    if (c <= 20) return 40;
    if (c <= 40) return 60;
    if (c <= 60) return 80;
    return 100;
  }

  if (p <= 10) {
    if (c <= 20) return 60;
    if (c <= 40) return 80;
    if (c <= 60) return 100;
    return 120;
  }

  // 11 篇以上（含 11~24）：留言≤10 1.5h, 11-39 2h, 40-60 2.5h, >60 3h
  if (c <= 10) return 90;
  if (c <= 39) return 120;
  if (c <= 60) return 150;
  return 180;
}

/** 計算三篇的總扣工時（分鐘） */
export function totalDeductedMinutes(
  product1: number,
  comment1: number,
  product2: number,
  comment2: number,
  product3: number,
  comment3: number
): number {
  let total = 0;
  if (product1 > 0 || comment1 > 0) {
    total += deductMinutesPerArticle(product1, comment1);
  }
  if (product2 > 0 || comment2 > 0) {
    total += deductMinutesPerArticle(product2, comment2);
  }
  if (product3 > 0 || comment3 > 0) {
    total += deductMinutesPerArticle(product3, comment3);
  }
  return total;
}
