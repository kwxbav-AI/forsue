/**
 * 當資料庫已用 prisma db push 與 schema 同步，但 _prisma_migrations 未齊時，
 * 將尚未標記為完成的 migration 全部標為 applied。
 * 用法：node scripts/baseline-migrations.cjs
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
const names = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

async function main() {
  const p = new PrismaClient();
  const applied = await p.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedSet = new Set(applied.map((r) => r.migration_name));
  await p.$disconnect();

  const pending = names.filter((n) => !appliedSet.has(n));
  if (pending.length === 0) {
    console.log("All migrations already marked as applied.");
    return;
  }

  console.log(`Marking ${pending.length} migration(s) as applied...`);
  for (const name of pending) {
    console.log(" -", name);
    execSync(`npx prisma migrate resolve --applied ${name}`, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
  }
  console.log("Done. Run: npx prisma migrate deploy");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
