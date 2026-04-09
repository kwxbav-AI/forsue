import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Node/Server-side 頁面授權：僅依 RolePermission + PAGE patterns，無 legacy fallback。
 */
export async function canAccessPageDb(role: UserRole, pathname: string): Promise<boolean> {
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (pathname.startsWith("/login")) return true;

  const rolePermRows = await prisma.rolePermission.findMany({
    where: { role },
    select: { moduleId: true, canRead: true, canWrite: true },
  });

  if (rolePermRows.length === 0) return false;

  const rolePermMap = new Map<string, { canRead: boolean; canWrite: boolean }>();
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

  for (const p of patterns) {
    if (!pathname.startsWith(p.pathPattern)) continue;
    const perm = rolePermMap.get(p.moduleId);
    if (!perm) continue;
    if (perm.canRead || perm.canWrite) return true;
  }

  return false;
}

function normalizePatternMethod(method: string | null): string | null {
  if (method == null || method === "") return null;
  return method;
}

/**
 * Node/Server-side API 授權：依 RolePermission + API patterns（與 effective / middleware 邏輯一致）。
 */
export async function canAccessApiDb(
  role: UserRole,
  pathname: string,
  method: string
): Promise<boolean> {
  const m = method.toUpperCase();
  const isRead = m === "GET" || m === "HEAD" || m === "OPTIONS";

  const rolePerms = await prisma.rolePermission.findMany({
    where: { role },
    include: {
      module: {
        select: {
          patterns: {
            where: { kind: "API" },
            select: { pathPattern: true, method: true },
          },
        },
      },
    },
  });

  for (const rp of rolePerms) {
    const canReadEffective = rp.canRead || rp.canWrite;
    const canWriteEffective = rp.canWrite;

    for (const pattern of rp.module.patterns) {
      if (!pathname.startsWith(pattern.pathPattern)) continue;
      const needMethod = normalizePatternMethod(pattern.method);
      if (needMethod && needMethod.toUpperCase() !== m) continue;
      if (isRead && canReadEffective) return true;
      if (!isRead && canWriteEffective) return true;
    }
  }

  return false;
}

/** 依模組 key 檢查讀/寫（子模組無 patterns 時仍有效）。 */
export async function hasModuleEffectivePermission(
  role: UserRole,
  moduleKey: string,
  min: "read" | "write"
): Promise<boolean> {
  const mod = await prisma.permissionModule.findUnique({
    where: { key: moduleKey },
    select: { id: true },
  });
  if (!mod) return false;

  const rp = await prisma.rolePermission.findUnique({
    where: { role_moduleId: { role, moduleId: mod.id } },
    select: { canRead: true, canWrite: true },
  });
  if (!rp) return false;
  if (min === "write") return rp.canWrite;
  return rp.canRead || rp.canWrite;
}
