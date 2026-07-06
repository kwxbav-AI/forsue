/**
 * 查找礁溪六月快照中工效比 >= 6000 的天（超標天）
 */
import { prisma } from './src/lib/prisma';
import { formatDateOnly } from './src/lib/date';

async function main() {
  const store = await prisma.store.findFirst({ where: { name: { contains: '礁溪' } }, select: { id: true, name: true } });
  if (!store) { console.log('找不到礁溪門市'); return; }
  console.log('Store:', store.name, store.id);

  const rows = await prisma.performanceDaily.findMany({
    where: { storeId: store.id, workDate: { gte: new Date('2026-06-01'), lte: new Date('2026-06-30') }, versionNo: 1 },
    select: { workDate: true, efficiencyRatio: true, isTargetMet: true, totalWorkHours: true, revenueAmount: true },
    orderBy: { workDate: 'asc' },
  });

  for (const r of rows) {
    const dow = r.workDate.getUTCDay();
    if (dow === 0) continue;
    const ratio = Number(r.efficiencyRatio);
    const exceed = dow !== 6 && ratio >= 6000;
    console.log(
      formatDateOnly(r.workDate),
      ['日','一','二','三','四','五','六'][dow],
      'ratio=' + ratio.toFixed(2),
      'laborH=' + Number(r.totalWorkHours).toFixed(2),
      'rev=' + Number(r.revenueAmount).toFixed(0),
      r.isTargetMet ? '達標' : '未達',
      exceed ? '<-- 超標' : ''
    );
  }

  await prisma.$disconnect();
}
main().catch(console.error);
