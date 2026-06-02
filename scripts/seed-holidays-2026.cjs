/**
 * 匯入 2026 國定假日／公司休假日至 Holiday 表
 * 用法：node scripts/seed-holidays-2026.cjs
 */
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { HOLIDAYS_2026 } = require("../prisma/holidays-2026.data.js");

const prisma = new PrismaClient();

async function main() {
  let upserted = 0;
  for (const { date: dateStr, name } of HOLIDAYS_2026) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    await prisma.holiday.upsert({
      where: { date },
      update: { name, isActive: true },
      create: { date, name, isActive: true },
    });
    upserted += 1;
  }
  console.log(`已匯入／更新 ${upserted} 筆 2026 假日`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
