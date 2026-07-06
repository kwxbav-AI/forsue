/**
 * 診斷：
 * 1. 礁溪 W4 (6/22-6/27)：快照有超標但月曆沒有
 * 2. 力行 W1 (6/1-6/6)：月曆顯示2次達標，快照顯示3次達標
 */
const { PrismaClient, Decimal } = require('@prisma/client');
const prisma = new PrismaClient();

const WEEKDAY_TARGET = 4000;
const SAT_TARGET = 5500;
const EXCEED = 6000;

function getTarget(dow) { return dow === 6 ? SAT_TARGET : WEEKDAY_TARGET; }
function isAchieved(dow, ratio) { return ratio >= getTarget(dow); }
function isExceed(dow, ratio) { return dow !== 6 && ratio >= EXCEED; }

async function checkStore(storeName, startDate, endDate, label) {
  const store = await prisma.store.findFirst({ where: { name: { contains: storeName } }, select: { id: true, name: true } });
  console.log(`\n===== ${store.name} ${label} =====`);

  // 1. 快照資料
  const snapshots = await prisma.performanceDaily.findMany({
    where: { storeId: store.id, versionNo: 1, workDate: { gte: new Date(startDate), lte: new Date(endDate) } },
    select: { workDate: true, efficiencyRatio: true, isTargetMet: true, totalWorkHours: true, revenueAmount: true },
    orderBy: { workDate: 'asc' },
  });

  // 2. 即時計算（工時 + 營收）
  // 讀取出勤資料
  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(endDate);
  const attendances = await prisma.attendanceRecord.findMany({
    where: { workDate: { gte: rangeStart, lte: rangeEnd }, employee: { defaultStoreId: store.id } },
    select: { workDate: true, workHours: true, employeeId: true, employee: { select: { name: true, hireDate: true, employeeCode: true } } },
  });
  const dispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: { gte: rangeStart, lte: rangeEnd }, confirmStatus: '已確認', toStoreId: store.id },
    select: { workDate: true, dispatchHours: true, employeeId: true },
  });
  const adjustments = await prisma.workhourAdjustment.findMany({
    where: { workDate: { gte: rangeStart, lte: rangeEnd }, storeId: store.id },
    select: { workDate: true, adjustmentHours: true, adjustmentType: true, note: true },
  });
  const revenues = await prisma.revenueRecord.findMany({
    where: { storeId: store.id, revenueDate: { gte: rangeStart, lte: rangeEnd } },
    select: { revenueDate: true, revenueAmount: true },
  });

  const days = ['日','一','二','三','四','五','六'];

  // 按日期彙整快照
  const snapMap = new Map();
  for (const s of snapshots) {
    const ymd = s.workDate.toISOString().slice(0,10);
    snapMap.set(ymd, s);
  }

  // 逐日列出
  let d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    const ymd = d.toISOString().slice(0,10);
    const dow = d.getUTCDay();
    if (dow === 0) { d = new Date(d.getTime() + 86400000); continue; }

    const snap = snapMap.get(ymd);
    const snapRatio = snap ? Number(snap.efficiencyRatio) : null;
    const snapLaborH = snap ? Number(snap.totalWorkHours) : null;
    const snapMet = snap?.isTargetMet ?? null;

    // 計算當日工時（簡化：出勤 + 調度 - 負工時異動 + 正工時異動）
    const dayAtts = attendances.filter(a => a.workDate.toISOString().slice(0,10) === ymd);
    const dayDisps = dispatches.filter(a => a.workDate.toISOString().slice(0,10) === ymd);
    const dayAdjs = adjustments.filter(a => a.workDate.toISOString().slice(0,10) === ymd);
    const dayRevs = revenues.filter(r => r.revenueDate.toISOString().slice(0,10) === ymd);

    const attH = dayAtts.reduce((s, a) => s + Number(a.workHours), 0);
    const dispH = dayDisps.reduce((s, a) => s + Number(a.dispatchHours), 0);
    const adjH = dayAdjs.reduce((s, a) => s + Number(a.adjustmentHours), 0);
    const rawH = attH + dispH + adjH;  // 近似值，忽略新進員工折減與content/store deduction
    const rev = dayRevs.reduce((s, r) => s + Number(r.revenueAmount), 0);
    const liveRatio = rawH > 0 ? rev / rawH : null;

    // 標記差異
    const snapExceed = snapRatio != null && isExceed(dow, snapRatio);
    const snapAch = snapRatio != null && isAchieved(dow, snapRatio);
    const liveExceed = liveRatio != null && isExceed(dow, liveRatio);
    const liveAch = liveRatio != null && isAchieved(dow, liveRatio);

    const diff = (snapExceed !== liveExceed || snapAch !== liveAch) ? ' <-- 差異!' : '';

    console.log(
      ymd, days[dow],
      `快照: ratio=${snapRatio != null ? snapRatio.toFixed(0) : 'N/A'} laborH=${snapLaborH != null ? snapLaborH.toFixed(2) : 'N/A'} ${snapExceed ? '超標' : snapAch ? '達標' : '未達'}`,
      `| 即時(近似): ratio=${liveRatio != null ? liveRatio.toFixed(0) : 'N/A'} rawH=${rawH.toFixed(2)} rev=${rev.toFixed(0)} ${liveExceed ? '超標' : liveAch ? '達標' : '未達'}`,
      diff
    );

    if (diff) {
      // 顯示工時異動明細
      for (const adj of dayAdjs) {
        const h = Number(adj.adjustmentHours);
        console.log(`   異動: ${h >= 0 ? '+' : ''}${h.toFixed(2)}h  ${adj.adjustmentType} ${adj.note || ''}`);
      }
    }

    d = new Date(d.getTime() + 86400000);
  }
}

async function main() {
  await checkStore('礁溪', '2026-06-22', '2026-06-27', 'W4');
  await checkStore('力行', '2026-06-01', '2026-06-06', 'W1');
  await prisma.$disconnect();
}
main().catch(console.error);
