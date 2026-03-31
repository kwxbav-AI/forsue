const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const STORES = [
  { name: "中正", codes: ["A001", "B001"] },
  { name: "義成", codes: ["A002", "B002"] },
  { name: "宜蘭", codes: ["A003", "B003"] },
  { name: "南竹", codes: ["A004", "B004"] },
  { name: "北成", codes: ["A005", "B005"] },
  { name: "女中", codes: ["A006", "B006"] },
  { name: "力行", codes: ["A007", "B007"] },
  { name: "五福", codes: ["A008", "B008"] },
  { name: "中北", codes: ["A009", "B009"] },
  { name: "五結", codes: ["A010", "B010"] },
  { name: "中埔", codes: ["A011", "B011"] },
  { name: "大業", codes: ["A012", "B012"] },
  { name: "中山", codes: ["A013", "B013"] },
  { name: "八德", codes: ["A014", "B014"] },
  { name: "南門", codes: ["A015", "B015"] },
  { name: "大竹", codes: ["A016", "B016"] },
  { name: "內壢", codes: ["A017", "B017"] },
  { name: "礁溪", codes: ["A018", "B018"] },
  { name: "昆明", codes: ["A021", "B021"] },
  { name: "東勇", codes: ["A022", "B022"] },
  { name: "校舍", codes: ["A023", "B023"] },
  { name: "大有", codes: ["A024", "B024"] },
  { name: "嘉興", codes: ["A080", "B080"] },
  { name: "虎林", codes: ["A082", "B082"] },
  { name: "福德", codes: ["A083", "B083"] },
  { name: "萬隆", codes: ["A085", "B085"] },
];

async function main() {
  for (const s of STORES) {
    const store = await prisma.store.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name },
    });

    for (const code of s.codes) {
      await prisma.storeAlias.upsert({
        where: { code },
        update: { storeId: store.id },
        create: { code, storeId: store.id },
      });
    }
  }

  await prisma.employee.upsert({
    where: { employeeCode: "E001" },
    update: {},
    create: { employeeCode: "E001", name: "王小明", defaultStoreId: null, position: "店員" },
  });
  await prisma.employee.upsert({
    where: { employeeCode: "E002" },
    update: {},
    create: { employeeCode: "E002", name: "李小華", defaultStoreId: null, position: "店員" },
  });
  await prisma.employee.upsert({
    where: { employeeCode: "E003" },
    update: {},
    create: { employeeCode: "E003", name: "陳小美", defaultStoreId: null, position: "店員" },
  });

  const existing = await prisma.performanceTargetSetting.findFirst({
    where: { isActive: true },
  });
  if (!existing) {
    await prisma.performanceTargetSetting.create({
      data: {
        targetValue: 4500,
        effectiveStartDate: new Date("2025-01-01"),
        effectiveEndDate: null,
        isActive: true,
      },
    });
  }

  // Permission modules + role permission defaults (full list)
  const modulesPath = path.join(__dirname, "..", "docs", "permission-modules.json");
  const raw = fs.readFileSync(modulesPath, "utf8");
  const spec = JSON.parse(raw);
  const modulesSpec = Array.isArray(spec.modules) ? spec.modules : [];

  // 1) upsert all modules without parentId first
  const idByKey = new Map();
  for (const m of modulesSpec) {
    const key = m.key;
    const module = await prisma.permissionModule.upsert({
      where: { key },
      update: {
        label: m.label,
        description: m.description || null,
        groupKey: m.group || "",
        sortOrder: typeof m.sortOrder === "number" ? m.sortOrder : 0,
        parentId: null,
      },
      create: {
        key,
        label: m.label,
        description: m.description || null,
        groupKey: m.group || "",
        sortOrder: typeof m.sortOrder === "number" ? m.sortOrder : 0,
        parentId: null,
      },
    });
    idByKey.set(key, module.id);
  }

  // 2) set parentId (second pass)
  for (const m of modulesSpec) {
    if (!m.parentKey) continue;
    const moduleId = idByKey.get(m.key);
    const parentId = idByKey.get(m.parentKey);
    if (!moduleId || !parentId) continue;
    await prisma.permissionModule.update({
      where: { id: moduleId },
      data: { parentId },
    });
  }

  // 3) upsert patterns
  for (const m of modulesSpec) {
    const moduleId = idByKey.get(m.key);
    if (!moduleId) continue;
    const patterns = Array.isArray(m.patterns) ? m.patterns : [];
    for (const p of patterns) {
      const method = p.method == null ? "" : String(p.method);
      await prisma.permissionModuleApiPattern.upsert({
        where: {
          moduleId_kind_pathPattern_method: {
            moduleId,
            kind: p.kind,
            pathPattern: p.pathPattern,
            method,
          },
        },
        update: {},
        create: {
          moduleId,
          kind: p.kind,
          pathPattern: p.pathPattern,
          method,
        },
      });
    }
  }

  function defaultPerm(role, moduleKey) {
    // ADMIN: all write
    if (role === "ADMIN") {
      // 視覺化欄位權限：扣工時可見（不需要寫入）
      if (moduleKey === "content-entries-deduct") return { canRead: true, canWrite: false };
      return { canRead: true, canWrite: true };
    }

    // EDITOR: mostly write, but keep legacy restriction (cannot manage users)
    if (role === "EDITOR") {
      if (moduleKey === "settings-users" || moduleKey === "settings-role-permissions") {
        return { canRead: false, canWrite: false };
      }
      // 視覺化欄位權限：扣工時可見（不需要寫入）
      if (moduleKey === "content-entries-deduct") {
        return { canRead: true, canWrite: false };
      }
      return { canRead: true, canWrite: true };
    }

    // VIEWER: read-only reports/performance/data, otherwise hidden
    if (role === "VIEWER") {
      if (
        moduleKey === "home" ||
        moduleKey === "forbidden" ||
        moduleKey.startsWith("reports") ||
        moduleKey.startsWith("performance-") ||
        moduleKey === "data"
      ) {
        return { canRead: true, canWrite: false };
      }
      if (moduleKey === "content-entries-deduct") return { canRead: false, canWrite: false };
      return { canRead: false, canWrite: false };
    }

    // STORE_STAFF: only specified modules write, others hidden
    if (role === "STORE_STAFF") {
      const writeKeys = new Set([
        "workhour-related",
        "dispatches",
        "store-hour-deductions",
        "content-entries",
      ]);
      if (writeKeys.has(moduleKey)) return { canRead: true, canWrite: true };
      // 扣工時可見：門市人員預設不可見
      if (moduleKey === "content-entries-deduct") return { canRead: false, canWrite: false };
      return { canRead: false, canWrite: false };
    }

    return { canRead: false, canWrite: false };
  }

  // 4) upsert role permissions for all modules
  const allModuleRows = await prisma.permissionModule.findMany({
    select: { id: true, key: true },
  });
  for (const role of ["ADMIN", "EDITOR", "VIEWER", "STORE_STAFF"]) {
    for (const m of allModuleRows) {
      const v = defaultPerm(role, m.key);
      const canWrite = !!v.canWrite;
      const canRead = !!v.canRead || canWrite;
      await prisma.rolePermission.upsert({
        where: { role_moduleId: { role, moduleId: m.id } },
        update: { canRead, canWrite },
        create: { role, moduleId: m.id, canRead, canWrite },
      });
    }
  }

  const userCount = await prisma.appUser.count();
  if (userCount === 0) {
    const adminUser = process.env.SEED_ADMIN_USERNAME || "admin";
    const adminPass = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
    const passwordHash = await bcrypt.hash(adminPass, 10);
    await prisma.appUser.create({
      data: {
        username: adminUser,
        passwordHash,
        role: "ADMIN",
      },
    });
    console.log(
      `Created default admin login: username="${adminUser}" (change password in production)`
    );
  }

  console.log(`Seed done. Stores: ${STORES.length}, employees: 3, target: 4500`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

