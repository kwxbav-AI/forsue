import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const [roles, modules, allPerms] = await Promise.all([
    prisma.role.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, name: true, isActive: true },
    }),
    prisma.permissionModule.findMany({
      orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      select: {
        id: true,
        key: true,
        label: true,
        description: true,
        groupKey: true,
        sortOrder: true,
        parentId: true,
      },
    }),
    prisma.rolePermission.findMany({
      select: { roleId: true, moduleId: true, canRead: true, canWrite: true },
    }),
  ]);

  // roleId → moduleId → {canRead, canWrite}
  const permsByRole = new Map<string, Map<string, { canRead: boolean; canWrite: boolean }>>();
  for (const p of allPerms) {
    if (!p.roleId || !p.moduleId) continue;
    let m = permsByRole.get(p.roleId);
    if (!m) { m = new Map(); permsByRole.set(p.roleId, m); }
    m.set(p.moduleId, { canRead: p.canRead, canWrite: p.canWrite });
  }

  return NextResponse.json({
    roles,
    modules,
    permissions: Object.fromEntries(
      roles.map((r) => {
        const mp = permsByRole.get(r.id) ?? new Map();
        return [
          r.id,
          Object.fromEntries(
            modules.map((m) => {
              const p = mp.get(m.id) ?? { canRead: false, canWrite: false };
              return [m.id, p];
            })
          ),
        ];
      })
    ),
  });
}
