import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(64),
  key: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  cloneFromRoleId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const roles = await prisma.role.findMany({
    orderBy: [{ isActive: "desc" }, { key: "asc" }],
    select: { id: true, key: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ roles });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, key, cloneFromRoleId } = parsed.data;
  const normalizedName = name.trim();
  if (!normalizedName) {
    return NextResponse.json({ error: "角色名稱不可空白" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        key: key ?? `R_${Date.now()}`,
        name: normalizedName,
        isActive: true,
      },
      select: { id: true, key: true, name: true, isActive: true },
    });

    if (cloneFromRoleId) {
      const perms = await tx.rolePermission.findMany({
        where: { roleId: cloneFromRoleId },
        select: { moduleId: true, canRead: true, canWrite: true },
      });
      if (perms.length > 0) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({
            roleId: role.id,
            moduleId: p.moduleId,
            canRead: p.canRead,
            canWrite: p.canWrite,
            // legacyRole 欄位仍存在於 DB（過渡期）；自訂角色先固定為 EDITOR
            legacyRole: "EDITOR" as any,
          })),
          skipDuplicates: true,
        });
      }
    }

    return role;
  });

  return NextResponse.json({ role: created });
}

