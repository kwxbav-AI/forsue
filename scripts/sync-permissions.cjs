const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  ALL_ROLE_SPECS,
  RETIRED_ROLE_KEYS,
  defaultPerm,
  legacyRoleForKey,
} = require("./role-permission-defaults.cjs");

function loadModulesSpec() {
  const modulesPath = path.join(__dirname, "..", "docs", "permission-modules.json");
  const raw = fs.readFileSync(modulesPath, "utf8");
  const spec = JSON.parse(raw);
  const modulesSpec = Array.isArray(spec.modules) ? spec.modules : [];
  return { version: spec.version ?? null, modulesSpec };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const { version, modulesSpec } = loadModulesSpec();
    console.log(
      `Sync permissions: modules=${modulesSpec.length}, specVersion=${version ?? "unknown"}`
    );

    // 1) upsert all modules without parentId first
    const idByKey = new Map();
    for (const m of modulesSpec) {
      const key = String(m.key || "").trim();
      if (!key) continue;
      const label = String(m.label || key);
      const description = m.description ? String(m.description) : null;
      const groupKey = m.group ? String(m.group) : "";
      const sortOrder = typeof m.sortOrder === "number" ? m.sortOrder : 0;

      const row = await prisma.permissionModule.upsert({
        where: { key },
        update: {
          label,
          description,
          groupKey,
          sortOrder,
          parentId: null,
        },
        create: {
          key,
          label,
          description,
          groupKey,
          sortOrder,
          parentId: null,
        },
        select: { id: true },
      });
      idByKey.set(key, row.id);
    }

    // 2) set parentId (second pass)
    for (const m of modulesSpec) {
      const key = String(m.key || "").trim();
      const parentKey = m.parentKey ? String(m.parentKey).trim() : "";
      if (!key || !parentKey) continue;
      const moduleId = idByKey.get(key);
      const parentId = idByKey.get(parentKey);
      if (!moduleId || !parentId) continue;
      await prisma.permissionModule.update({
        where: { id: moduleId },
        data: { parentId },
      });
    }

    // 3) upsert patterns
    let patternUpserts = 0;
    for (const m of modulesSpec) {
      const key = String(m.key || "").trim();
      const moduleId = idByKey.get(key);
      if (!moduleId) continue;
      const patterns = Array.isArray(m.patterns) ? m.patterns : [];
      for (const p of patterns) {
        if (!p) continue;
        const kind = String(p.kind || "").trim();
        const pathPattern = String(p.pathPattern || "").trim();
        if (!kind || !pathPattern) continue;
        const method = p.method == null ? "" : String(p.method);

        await prisma.permissionModuleApiPattern.upsert({
          where: {
            moduleId_kind_pathPattern_method: {
              moduleId,
              kind,
              pathPattern,
              method,
            },
          },
          update: {},
          create: {
            moduleId,
            kind,
            pathPattern,
            method,
          },
        });
        patternUpserts++;
      }
    }

    // 3b) delete modules no longer in JSON
    const validKeys = new Set([...idByKey.keys()]);
    const allExisting = await prisma.permissionModule.findMany({ select: { id: true, key: true } });
    const toDelete = allExisting.filter((m) => !validKeys.has(m.key));
    if (toDelete.length > 0) {
      const deleteIds = toDelete.map((m) => m.id);
      await prisma.rolePermission.deleteMany({ where: { moduleId: { in: deleteIds } } });
      await prisma.permissionModuleApiPattern.deleteMany({ where: { moduleId: { in: deleteIds } } });
      await prisma.permissionModule.deleteMany({ where: { id: { in: deleteIds } } });
      console.log(`Deleted ${toDelete.length} retired modules: ${toDelete.map((m) => m.key).join(", ")}`);
    }

    // 4) upsert roles + default role permissions
    const roleIdByKey = new Map();
    for (const r of ALL_ROLE_SPECS) {
      const row = await prisma.role.upsert({
        where: { key: r.key },
        update: { name: r.name, isActive: true },
        create: { id: r.key, key: r.key, name: r.name, isActive: true },
        select: { id: true },
      });
      roleIdByKey.set(r.key, row.id);
    }

    let permissionUpserts = 0;
    const allModuleRows = await prisma.permissionModule.findMany({
      select: { id: true, key: true },
    });
    for (const role of ALL_ROLE_SPECS.map((r) => r.key)) {
      const roleId = roleIdByKey.get(role);
      if (!roleId) continue;
      for (const m of allModuleRows) {
        const v = defaultPerm(role, m.key);
        const canWrite = !!v.canWrite;
        const canRead = !!v.canRead || canWrite;
        await prisma.rolePermission.upsert({
          where: { roleId_moduleId: { roleId, moduleId: m.id } },
          update: { canRead, canWrite },
          create: {
            roleId,
            legacyRole: legacyRoleForKey(role),
            moduleId: m.id,
            canRead,
            canWrite,
          },
        });
        permissionUpserts++;
      }
    }

    let rolesRetired = 0;
    for (const key of RETIRED_ROLE_KEYS) {
      const result = await prisma.role.updateMany({
        where: { key },
        data: { isActive: false },
      });
      rolesRetired += result.count;
    }

    console.log(
      `Sync permissions done. modulesUpserted=${idByKey.size}, patternsUpserted=${patternUpserts}, rolesUpserted=${roleIdByKey.size}, rolePermissionsUpserted=${permissionUpserts}, rolesRetired=${rolesRetired}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

