import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure default roles exist (for transition to Role table)
  const defaultRoles = [
    { key: "ADMIN", name: "管理員" },
    { key: "EDITOR", name: "編輯者" },
    { key: "VIEWER", name: "檢視者" },
    { key: "STORE_STAFF", name: "門市人員" },
  ] as const;

  const roleIdByKey = new Map<string, string>();
  for (const r of defaultRoles) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, isActive: true },
      create: { id: r.key, key: r.key, name: r.name, isActive: true },
      select: { id: true, key: true },
    });
    roleIdByKey.set(role.key, role.id);
  }

  // 建立預設門市清單（依提供的 POSA/POSB 對照）
  const { STORES } = await import("./stores.data");
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

  const emp1 = await prisma.employee.upsert({
    where: { employeeCode: "E001" },
    update: {},
    create: {
      employeeCode: "E001",
      name: "王小明",
      defaultStoreId: null,
      position: "店員",
    },
  });
  const emp2 = await prisma.employee.upsert({
    where: { employeeCode: "E002" },
    update: {},
    create: {
      employeeCode: "E002",
      name: "李小華",
      defaultStoreId: null,
      position: "店員",
    },
  });
  const emp3 = await prisma.employee.upsert({
    where: { employeeCode: "E003" },
    update: {},
    create: {
      employeeCode: "E003",
      name: "陳小美",
      defaultStoreId: null,
      position: "店員",
    },
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
      patterns: [{ kind: "PAGE" as const, pathPattern: "/workhour-related" }],
    },
    {
      key: "dispatches",
      label: "人員調度",
      description: "新增/修改調度紀錄。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/dispatches" },
        { kind: "API" as const, pathPattern: "/api/dispatches" },
        { kind: "API" as const, pathPattern: "/api/stores" },
        { kind: "API" as const, pathPattern: "/api/employees" },
      ],
    },
    {
      key: "workhour-adjustments",
      label: "工時異動調整",
      description: "查詢與新增/編輯工時扣抵。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/workhour-adjustments" },
        { kind: "API" as const, pathPattern: "/api/workhour-adjustments" },
      ],
    },
    {
      key: "batch-workhour-adjustment",
      label: "批次調整工時",
      description: "同一原因/日期批次寫入扣除時數。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/batch-workhour-adjustment" },
        { kind: "API" as const, pathPattern: "/api/workhour-adjustments/batch" },
        { kind: "API" as const, pathPattern: "/api/employees" },
      ],
    },
    {
      key: "store-hour-deductions",
      label: "效期/清掃工時",
      description: "依日期/門市填寫效期或清掃扣抵時數。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/store-hour-deductions" },
        { kind: "API" as const, pathPattern: "/api/store-hour-deductions" },
        { kind: "API" as const, pathPattern: "/api/stores" },
      ],
    },
    {
      key: "content-entries",
      label: "現貨文填報（含扣工時）",
      description: "內容篇數填報並計算扣工時。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/content-entries" },
        { kind: "API" as const, pathPattern: "/api/content-entries" },
        { kind: "API" as const, pathPattern: "/api/stores" },
      ],
    },
    {
      key: "reports-charts",
      label: "圖表",
      description: "區間加總、排序與工效比長條圖。",
      patterns: [
        { kind: "PAGE" as const, pathPattern: "/reports/charts" },
        { kind: "API" as const, pathPattern: "/api/reports/charts" },
      ],
    },
  ] as const;

  const rolePermissionsByModuleKey: Record<
    string,
    Record<string, { canRead: boolean; canWrite: boolean }>
  > = {
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
    "reports-charts": {
      ADMIN: { canRead: true, canWrite: true },
      EDITOR: { canRead: true, canWrite: false },
      VIEWER: { canRead: true, canWrite: false },
      STORE_STAFF: { canRead: true, canWrite: false },
    },
  };

  for (const m of modules) {
    const module = await prisma.permissionModule.upsert({
      where: { key: m.key },
      update: {
        label: m.label,
        description: m.description,
      },
      create: {
        key: m.key,
        label: m.label,
        description: m.description,
      },
    });

    // patterns
    for (const p of m.patterns) {
      await prisma.permissionModuleApiPattern.upsert({
        where: {
          moduleId_kind_pathPattern_method: {
            moduleId: module.id,
            kind: p.kind,
            pathPattern: p.pathPattern,
            method: "",
          },
        },
        update: {},
        create: {
          moduleId: module.id,
          kind: p.kind,
          pathPattern: p.pathPattern,
          method: "",
        },
      });
    }

    // role permissions
    const rp = rolePermissionsByModuleKey[m.key];
    for (const role of ["ADMIN", "EDITOR", "VIEWER", "STORE_STAFF"] as const) {
      const v = rp[role];
      const roleId = roleIdByKey.get(role);
      if (!roleId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_moduleId: { roleId, moduleId: module.id } },
        update: { canRead: v.canRead, canWrite: v.canWrite },
        create: {
          roleId,
          legacyRole: role,
          moduleId: module.id,
          canRead: v.canRead,
          canWrite: v.canWrite,
        },
      });
    }
  }

  console.log(
    "Seed 完成：門市清單/員工/目標值、以及 Permission Modules 預設權限"
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
