const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

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

    console.log(`Sync permissions done. modulesUpserted=${idByKey.size}, patternsUpserted=${patternUpserts}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

