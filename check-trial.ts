/**
 * 找出哪些門市哪些天，修正前月曆比快照多算達標（四捨五入造成）
 *
 * 條件：快照 efficiencyRatio 介於 [threshold-0.5, threshold) → 快照未達標，但四捨五入後 = threshold → 月曆舊邏輯判達標
 * 平日門檻 4000 → 受影響範圍 3999.5 ~ 3999.999…
 * 週六門檻 5500 → 受影響範圍 5499.5 ~ 5499.999…
 */
import { prisma } from './src/lib/prisma';
import { formatDateOnly } from './src/lib/date';

async function main() {
  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false as any },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const storeNameMap = new Map(stores.map(s => [s.id, s.name]));

  // 找工效比在門檻附近但未達標的天（快照 isTargetMet=false，但四捨五入後剛好 = 門檻）
  // weekday: 3999.5 <= ratio < 4000
  // saturday: 5499.5 <= ratio < 5500
  const rows = await prisma.performanceDaily.findMany({
    where: {
      versionNo: 1,
      isTargetMet: false,
      totalWorkHours: { gt: 0 },
      store: { isActive: true, hideInReports: false as any },
      OR: [
        // 平日
        { efficiencyRatio: { gte: 3999.5, lt: 4000 } },
        // 週六
        { efficiencyRatio: { gte: 5499.5, lt: 5500 } },
      ],
    },
    select: {
      storeId: true,
      workDate: true,
      efficiencyRatio: true,
      totalWorkHours: true,
      revenueAmount: true,
    },
    orderBy: [{ storeId: 'asc' }, { workDate: 'asc' }],
  });

  if (rows.length === 0) {
    console.log('✅ 沒有任何門市的達標結果受到四捨五入影響。');
    await prisma.$disconnect();
    return;
  }

  // 按門市彙總
  const byStore = new Map<string, { ymd: string; ratio: number }[]>();
  for (const r of rows) {
    const name = storeNameMap.get(r.storeId) ?? r.storeId;
    const dow = r.workDate.getUTCDay();
    if (dow === 0) continue; // 週日跳過
    const ratio = Number(r.efficiencyRatio);
    const rounded = Math.round(ratio);
    const threshold = dow === 6 ? 5500 : 4000;
    if (rounded < threshold) continue; // 四捨五入後仍未達，不在受影響範圍
    if (!byStore.has(name)) byStore.set(name, []);
    byStore.get(name)!.push({ ymd: formatDateOnly(r.workDate), ratio });
  }

  if (byStore.size === 0) {
    console.log('✅ 沒有任何門市的達標結果受到四捨五入影響。');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== 受四捨五入影響的門市與天數 ===`);
  console.log(`（修正前月曆多算達標、修正後改為未達標）\n`);

  let totalDiff = 0;
  for (const [name, days] of byStore) {
    totalDiff += days.length;
    console.log(`${name}  共 ${days.length} 天`);
    for (const d of days) {
      console.log(`  ${d.ymd}  工效比 ${d.ratio.toFixed(4)}  → Math.round = ${Math.round(d.ratio)}`);
    }
  }
  console.log(`\n合計影響 ${totalDiff} 天`);

  await prisma.$disconnect();
}

main().catch(console.error);
