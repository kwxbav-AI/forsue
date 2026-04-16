const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const keys = [
    "delete-approve-content-entries",
    "delete-approve-workhour-adjustments",
    "delete-approve-stores",
    "content-entries",
    "workhour-adjustments",
    "stores",
  ];

  const mods = await prisma.permissionModule.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });

  const idByKey = Object.fromEntries(mods.map((m) => [m.key, m.id]));

  const rows = await prisma.rolePermission.findMany({
    where: { role: "STORE_STAFF", moduleId: { in: Object.values(idByKey) } },
    select: { moduleId: true, canRead: true, canWrite: true },
  });

  const byId = Object.fromEntries(rows.map((r) => [r.moduleId, r]));

  console.log("DATABASE_URL host:", (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] || "(unknown)");
  console.log("MODULE_IDS", idByKey);
  for (const k of keys) {
    const id = idByKey[k];
    const r = id ? byId[id] : null;
    console.log(k, r ? { canRead: r.canRead, canWrite: r.canWrite } : "(module_missing_or_no_roleperm)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

