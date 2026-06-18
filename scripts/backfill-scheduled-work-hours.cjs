/**
 * backfill-scheduled-work-hours.cjs
 * 針對 scheduledWorkHours IS NULL 的出勤記錄，補算表訂工時：
 *   1. shiftType 欄位格式解析（如 FT-10:00-18:00、司機-07:30-15:30）
 *   2. 無 shiftType 時，用 Math.floor(workHours)（整點排班：8H/4H/6H 等）
 *
 * 注意：不使用 startTime/endTime 推算，那是實際打卡時間，不是表訂時間。
 *
 * 用法：
 *   node scripts/backfill-scheduled-work-hours.cjs           # 正式寫入
 *   node scripts/backfill-scheduled-work-hours.cjs --dry-run # 只顯示不寫入
 */

require("./load-env.cjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const isDryRun = process.argv.includes("--dry-run");

function parseTimeToMinutes(value) {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** 從班別字串解析工時（支援中英文前綴，如 FT-10:00-18:00、司機-07:30-15:30） */
function parseShiftType(shiftType) {
  if (!shiftType) return null;
  const m = shiftType.trim().match(/-(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return null;
  const s = parseTimeToMinutes(m[1]);
  const e = parseTimeToMinutes(m[2]);
  if (s == null || e == null || e <= s) return null;
  return (e - s) / 60;
}

/** 判斷 scheduledWorkHours 是否為「舊腳本錯誤設值」（非 0.5 倍數 → 從實際打卡時差算出）*/
function isWronglySetFromActualTime(scheduled, workHours) {
  const s = Number(scheduled);
  const w = Number(workHours);
  // 若 scheduledWorkHours 不是 0.5H 的整數倍 → 是從實際打卡時差算的錯誤值
  return Math.round(s * 2) !== s * 2;
}

async function main() {
  console.log(`模式：${isDryRun ? "Dry-run（不寫入）" : "正式寫入"}`);

  // 同時撈 null 的記錄，以及被錯誤設成實際工時的記錄
  const records = await prisma.attendanceRecord.findMany({
    where: { workHours: { gt: 0 } },
    select: { id: true, workHours: true, scheduledWorkHours: true, shiftType: true, workDate: true },
  });

  console.log(`共 ${records.length} 筆有效出勤記錄`);

  // 篩出需要更新的：null 或被錯誤設成非 0.5H 整數倍的
  const toFix = records.filter((r) => {
    if (r.scheduledWorkHours == null) return true;
    return isWronglySetFromActualTime(r.scheduledWorkHours, r.workHours);
  });

  console.log(`需修正：${toFix.length} 筆（null：${toFix.filter(r => r.scheduledWorkHours == null).length}，錯誤值：${toFix.filter(r => r.scheduledWorkHours != null).length}）`);

  let fromShiftType = 0;
  let fromFloor = 0;
  let skipped = 0;
  const updates = [];

  for (const r of toFix) {
    let hours = null;
    let source = "";

    // 優先：shiftType 格式解析
    hours = parseShiftType(r.shiftType);
    if (hours != null) {
      fromShiftType++;
      source = `shiftType(${r.shiftType})`;
    }

    // 備用：floor(workHours)——適用整點排班（8H、4H、6H 等）
    if (hours == null) {
      const wh = Number(r.workHours);
      const floored = Math.floor(wh);
      if (floored > 0) {
        hours = floored;
        fromFloor++;
        source = `floor(${wh.toFixed(2)})`;
      }
    }

    if (hours == null) {
      skipped++;
      continue;
    }

    updates.push({ id: r.id, hours, source, workDate: r.workDate, oldVal: r.scheduledWorkHours });
  }

  console.log(
    `可修正：${updates.length} 筆（班別解析：${fromShiftType}，floor 推算：${fromFloor}），無法判斷：${skipped} 筆`
  );

  if (updates.length > 0) {
    console.log("樣本（前 5 筆）：");
    updates.slice(0, 5).forEach((u) => {
      console.log(
        `  ${u.workDate.toISOString().slice(0, 10)} | 舊值=${u.oldVal ?? "null"} → 新值=${u.hours}h（來源：${u.source}）`
      );
    });
  }

  if (isDryRun || updates.length === 0) return;

  // 批次更新，每次 500 筆
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((u) =>
        prisma.attendanceRecord.update({
          where: { id: u.id },
          data: { scheduledWorkHours: u.hours },
        })
      )
    );
    done += chunk.length;
    process.stdout.write(`\r已更新 ${done} / ${updates.length}`);
  }
  console.log("\n完成。");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
