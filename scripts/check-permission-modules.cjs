const fs = require("fs");
const path = require("path");

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function collectDashboardPages(appDir) {
  const dashboardRoot = path.join(appDir, "(dashboard)");
  const pages = new Set();
  const stack = [{ abs: dashboardRoot, routeParts: [] }];

  while (stack.length) {
    const { abs, routeParts } = stack.pop();
    if (!isDirectory(abs)) continue;

    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      // skip special dirs
      if (name.startsWith(".")) continue;
      if (name === "api") continue;

      const nextAbs = path.join(abs, name);

      // route groups like (foo) do not add path segments
      const isGroup = name.startsWith("(") && name.endsWith(")");
      const isDynamic = name.startsWith("[") && name.endsWith("]");

      const nextParts = [...routeParts];
      if (!isGroup) {
        // skip dynamic routes from required list (they are not user-facing pages)
        if (isDynamic) {
          stack.push({ abs: nextAbs, routeParts: nextParts });
          continue;
        }
        nextParts.push(name);
      }

      stack.push({ abs: nextAbs, routeParts: nextParts });
    }

    // A directory is a routable page if it has page.tsx (or page.jsx)
    const hasPage =
      isFile(path.join(abs, "page.tsx")) ||
      isFile(path.join(abs, "page.jsx")) ||
      isFile(path.join(abs, "page.ts")) ||
      isFile(path.join(abs, "page.js"));
    if (hasPage) {
      const route = "/" + routeParts.join("/");
      pages.add(route === "/" ? "/" : route);
    }
  }

  return Array.from(pages).sort();
}

function loadPermissionModulesJson(repoRoot) {
  const p = path.join(repoRoot, "docs", "permission-modules.json");
  const raw = fs.readFileSync(p, "utf8");
  const spec = JSON.parse(raw);
  const modules = Array.isArray(spec.modules) ? spec.modules : [];
  return modules;
}

function collectPagePatterns(modules) {
  const patterns = new Set();
  for (const m of modules) {
    const list = Array.isArray(m.patterns) ? m.patterns : [];
    for (const p of list) {
      if (p && p.kind === "PAGE" && typeof p.pathPattern === "string") {
        patterns.add(p.pathPattern);
      }
    }
  }
  return patterns;
}

function main() {
  const repoRoot = path.join(__dirname, "..");
  const appDir = path.join(repoRoot, "src", "app");
  const pages = collectDashboardPages(appDir);
  const modules = loadPermissionModulesJson(repoRoot);
  const pagePatterns = collectPagePatterns(modules);

  // Allowed always
  const allow = new Set(["/", "/forbidden", "/login"]);

  const missing = [];
  for (const r of pages) {
    if (allow.has(r)) continue;
    if (!pagePatterns.has(r)) {
      missing.push(r);
    }
  }

  if (missing.length > 0) {
    console.error(
      [
        "Permission modules missing PAGE patterns for these dashboard pages:",
        ...missing.map((x) => `- ${x}`),
        "",
        "Please add PAGE patterns to docs/permission-modules.json (modules[].patterns).",
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(`OK: ${pages.length} dashboard pages covered by PAGE patterns.`);
}

main();

