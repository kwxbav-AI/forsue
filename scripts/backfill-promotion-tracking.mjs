/**
 * 一次性回填：從 Excel 匯入跨店時數起始值到 EmployeePromotionTracking 資料表
 * 執行：node scripts/backfill-promotion-tracking.mjs
 */
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';
import { randomBytes } from 'crypto';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const prisma = new PrismaClient();
const createId = () => randomBytes(14).toString('base64url');

// 各職等升職需要的時數（鍵 = 目前職等）
const GRADE_HOURS = {
  '三級營業員': { target: '二級營業員', hours: 40 },
  '二級營業員': { target: '一級營業員', hours: 80 },
  '初階兼職':   { target: '進階兼職',   hours: 40 },
};

const CARRY_OVER_DATE = new Date('2026-02-28');
const EXCEL_PATH = 'D:/12晉升考核_門市/門市人員跨店時數統計.xlsx';

// 讀 Excel
const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['時數統計'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// 建立 name -> { carryOver, excelGrade } 的 map
// 欄位: 姓名=1, AS=44(2026-02-28前總累計), AT=45(2026-03目前職等)
const excelMap = new Map();
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const name = String(row[1] ?? '').trim();
  if (!name) continue;
  const carryOver = typeof row[44] === 'number' ? row[44] : 0;
  const excelGrade = String(row[45] ?? '').trim();
  excelMap.set(name, { carryOver, excelGrade });
}
console.log(`Excel 人數: ${excelMap.size}`);

// 讀 forsue 員工（有職稱的）
const employees = await prisma.employee.findMany({
  where: { leaveDate: null },
  select: { id: true, name: true, position: true },
});
console.log(`Forsue 員工: ${employees.length}`);

const unmatched = [];
let inserted = 0;

for (const emp of employees) {
  const excel = excelMap.get(emp.name);
  if (!excel) {
    unmatched.push(emp.name);
    continue;
  }

  // 系統最新職等（6月已更新）優先；若系統無職稱則用 Excel AT 欄
  const currentGrade = (emp.position?.trim()) || excel.excelGrade;
  if (!currentGrade) continue;

  // 計算 carryOver
  let hoursCarryOver: number;
  if (currentGrade === excel.excelGrade) {
    // 職等未變：AS 欄直接當作 carryOver
    hoursCarryOver = Math.max(0, excel.carryOver);
  } else {
    // 職等有變（6月升職）：AS 扣掉舊職等門檻，剩餘才繼續累積
    const previousHours = GRADE_HOURS[excel.excelGrade]?.hours ?? 0;
    hoursCarryOver = Math.max(0, excel.carryOver - previousHours);
  }

  const { target: targetGrade = null, hours: hoursRequired = null } =
    GRADE_HOURS[currentGrade] ?? {};

  const note = currentGrade !== excel.excelGrade
    ? `6月升職：${excel.excelGrade} → ${currentGrade}；AS=${excel.carryOver.toFixed(1)}，扣${GRADE_HOURS[excel.excelGrade]?.hours ?? 0}h後carryOver=${hoursCarryOver.toFixed(1)}`
    : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "EmployeePromotionTracking"
      (id, "employeeId", "currentGrade", "targetGrade", "hoursRequired", "hoursCarryOver", "carryOverDate", note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ("employeeId") DO UPDATE SET
       "currentGrade"   = EXCLUDED."currentGrade",
       "targetGrade"    = EXCLUDED."targetGrade",
       "hoursRequired"  = EXCLUDED."hoursRequired",
       "hoursCarryOver" = EXCLUDED."hoursCarryOver",
       "carryOverDate"  = EXCLUDED."carryOverDate",
       note             = EXCLUDED.note,
       "updatedAt"      = CURRENT_TIMESTAMP`,
    createId(), emp.id, currentGrade, targetGrade,
    hoursRequired, hoursCarryOver, CARRY_OVER_DATE, note,
  );
  inserted++;
}

console.log(`\n=== 回填結果 ===`);
console.log(`匯入/更新: ${inserted} 筆`);
console.log(`Excel 找不到對應: ${unmatched.length} 筆`);
if (unmatched.length > 0) console.log('  名單:', unmatched.join(', '));

await prisma.$disconnect();
