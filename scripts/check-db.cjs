/**
 * 檢查目前 .env 連線的資料庫是否有營收／出勤（本機開發診斷用）
 * 使用：npm run db:check
 */
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { loadEnvFiles, maskDatabaseUrl } = require("./load-env.cjs");

const root = path.join(__dirname, "..");
loadEnvFiles(root);

const url = process.env.DATABASE_URL;
const info = maskDatabaseUrl(url);

async function main() {
  console.log("\n=== 資料庫連線診斷 ===\n");
  console.log("DATABASE_URL:", info.masked);
  console.log("類型:", info.kind);

  if (!url) {
    console.error("\n請在 .env 設定 DATABASE_URL。見 docs/本機開發連雲端資料庫.md\n");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const [revenueTotal, attendanceTotal, revenueLatest, revenueApr] =
      await Promise.all([
        prisma.revenueRecord.count(),
        prisma.attendanceRecord.count(),
        prisma.revenueRecord.findFirst({
          orderBy: { revenueDate: "desc" },
          select: { revenueDate: true, revenueAmount: true, store: { select: { name: true } } },
        }),
        prisma.revenueRecord.count({
          where: {
            revenueDate: {
              gte: new Date("2026-04-01T00:00:00+08:00"),
              lte: new Date("2026-04-10T23:59:59.999+08:00"),
            },
          },
        }),
      ]);

    console.log("\n資料筆數:");
    console.log("  RevenueRecord（營收）:", revenueTotal);
    console.log("  AttendanceRecord（出勤）:", attendanceTotal);
    console.log("  2026-04-01～04-10 營收筆數:", revenueApr);

    if (revenueLatest) {
      const d = revenueLatest.revenueDate.toISOString().slice(0, 10);
      console.log(
        `\n最新一筆營收: ${d} / ${revenueLatest.store?.name ?? "?"} / ${Number(revenueLatest.revenueAmount)}`
      );
    }

    const ok = revenueTotal > 0 && attendanceTotal > 0;

    if (info.isLocal && !ok) {
      console.log("\n⚠ 目前連到「本機」資料庫，且幾乎沒有上傳資料。");
      console.log("  → 營收報表、圖表、Dashboard 在本機都會是空的。");
      console.log("  → 請改連正式站同一個雲端資料庫：");
      console.log("     docs/本機開發連雲端資料庫.md");
      process.exit(2);
    }

    if (!ok) {
      console.log("\n⚠ 資料庫可連線，但營收或出勤筆數為 0，請確認是否連到正確的 DB。");
      process.exit(2);
    }

    console.log("\n✓ 資料庫內有營收與出勤，本機應可顯示報表與 Dashboard。\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n連線失敗:", e.message);
  console.error("請檢查 DATABASE_URL 是否正確、網路是否可連 Neon／雲端 DB。\n");
  process.exit(1);
});
