import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function viewerPageAllowed(pathname: string): boolean {
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (pathname.startsWith("/reports")) return true;
  if (pathname === "/data" || pathname.startsWith("/data/")) return true;
  if (
    pathname.startsWith("/performance/daily") ||
    pathname.startsWith("/performance/target-summary")
  ) {
    return true;
  }
  return false;
}

function legacyCanAccessPage(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (role === "ADMIN") return true;
  if (role === "EDITOR") {
    if (pathname.startsWith("/settings/users")) return false;
    return true;
  }
  return viewerPageAllowed(pathname);
}

/**
 * Node/Server-side authorization check (可使用 Prisma)：
 * - 不出現：matching module 的 canRead/canWrite 都 false -> deny
 * - 若沒有匹配到任何 module：
 *   - ADMIN/EDITOR/VIEWER：fallback legacy
 *   - 其他角色：deny
 */
export async function canAccessPageDb(
  role: UserRole,
  pathname: string
): Promise<boolean> {
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (pathname.startsWith("/login")) return true;

  const rolePermRows = await prisma.rolePermission.findMany({
    where: { role },
    select: { moduleId: true, canRead: true, canWrite: true },
  });

  if (rolePermRows.length === 0) {
    if (role === "ADMIN" || role === "EDITOR" || role === "VIEWER") {
      return legacyCanAccessPage(role, pathname);
    }
    return false;
  }

  const rolePermMap = new Map<
    string,
    { canRead: boolean; canWrite: boolean }
  >();
  for (const r of rolePermRows) {
    rolePermMap.set(r.moduleId, { canRead: r.canRead, canWrite: r.canWrite });
  }

  const patterns = await prisma.permissionModuleApiPattern.findMany({
    where: {
      moduleId: { in: Array.from(rolePermMap.keys()) },
      kind: "PAGE",
    },
    select: { moduleId: true, pathPattern: true },
  });

  let matchedAny = false;
  let allowed = false;

  for (const p of patterns) {
    if (!pathname.startsWith(p.pathPattern)) continue;
    matchedAny = true;
    const perm = rolePermMap.get(p.moduleId);
    if (!perm) continue;
    if (perm.canRead || perm.canWrite) allowed = true;
  }

  if (matchedAny) return allowed;

  if (role === "ADMIN" || role === "EDITOR" || role === "VIEWER") {
    return legacyCanAccessPage(role, pathname);
  }
  return false;
}

