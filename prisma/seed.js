const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

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

  // Permission modules + role permission defaults
  // 目的：讓「門市人員」的權限能在未大幅改 UI/邏輯前先有 DB 可用資料。
  const modules = [
    {
      key: "workhour-related",
      label: "工時異動相關（入口）",
      description: "工時異動相關卡片（含連結）。",
      patterns: [{ kind: "PAGE", pathPattern: "/workhour-related", method: "" }],
    },
    {
      key: "dispatches",
      label: "人員調度",
      description: "新增/修改調度紀錄。",
      patterns: [
        { kind: "PAGE", pathPattern: "/dispatches", method: "" },
        { kind: "API", pathPattern: "/api/dispatches", method: "" },
        { kind: "API", pathPattern: "/api/stores", method: "" },
        { kind: "API", pathPattern: "/api/employees", method: "" },
      ],
    },
    {
      key: "workhour-adjustments",
      label: "工時異動調整",
      description: "查詢與新增/編輯工時扣抵。",
      patterns: [
        { kind: "PAGE", pathPattern: "/workhour-adjustments", method: "" },
        { kind: "API", pathPattern: "/api/workhour-adjustments", method: "" },
      ],
    },
    {
      key: "batch-workhour-adjustment",
      label: "批次調整工時",
      description: "同一原因/日期批次寫入扣除時數。",
      patterns: [
        { kind: "PAGE", pathPattern: "/batch-workhour-adjustment", method: "" },
        { kind: "API", pathPattern: "/api/workhour-adjustments/batch", method: "" },
        { kind: "API", pathPattern: "/api/employees", method: "" },
      ],
    },
    {
      key: "store-hour-deductions",
      label: "效期/清掃工時",
      description: "依日期/門市填寫效期或清掃扣抵時數。",
      patterns: [
        { kind: "PAGE", pathPattern: "/store-hour-deductions", method: "" },
        { kind: "API", pathPattern: "/api/store-hour-deductions", method: "" },
        { kind: "API", pathPattern: "/api/stores", method: "" },
      ],
    },
    {
      key: "content-entries",
      label: "現貨文填報（含扣工時）",
      description: "內容篇數填報並計算扣工時。",
      patterns: [
        { kind: "PAGE", pathPattern: "/content-entries", method: "" },
        { kind: "API", pathPattern: "/api/content-entries", method: "" },
        { kind: "API", pathPattern: "/api/stores", method: "" },
      ],
    },
  ];

  const rolePermissionsByModuleKey = {
    "workhour-related": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: true, canWrite: true },
    },
    dispatches: {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: true, canWrite: true },
    },
    "workhour-adjustments": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: false, canWrite: false },
    },
    "batch-workhour-adjustment": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: false, canWrite: false },
    },
    "store-hour-deductions": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: true, canWrite: true },
    },
    "content-entries": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: true },
      VIEWER: { canRead: false, canWrite: false },
      STORE_STAFF: { canRead: true, canWrite: true },
    },
  };

  for (const m of modules) {
    const module = await prisma.permissionModule.upsert({
      where: { key: m.key },
      update: { label: m.label, description: m.description },
      create: { key: m.key, label: m.label, description: m.description },
    });

    for (const p of m.patterns) {
      await prisma.permissionModuleApiPattern.upsert({
        where: {
          moduleId_kind_pathPattern_method: {
            moduleId: module.id,
            kind: p.kind,
            pathPattern: p.pathPattern,
            method: p.method,
          },
        },
        update: {},
        create: {
          moduleId: module.id,
          kind: p.kind,
          pathPattern: p.pathPattern,
          method: p.method,
        },
      });
    }

    const rp = rolePermissionsByModuleKey[m.key];
    for (const role of ["ADMIN", "EDITOR", "VIEWER", "STORE_STAFF"]) {
      const v = rp[role];
      await prisma.rolePermission.upsert({
        where: { role_moduleId: { role, moduleId: module.id } },
        update: { canRead: v.canRead, canWrite: v.canWrite },
        create: {
          role,
          moduleId: module.id,
          canRead: v.canRead,
          canWrite: v.canWrite,
        },
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

