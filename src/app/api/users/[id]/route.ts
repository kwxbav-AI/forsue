import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hashPassword } from "@/lib/password";
import { DEFAULT_ROLE_LABELS } from "@/lib/permissions";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  password: z.string().min(6).max(128).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數不正確" }, { status: 400 });
  }

  const { password, isActive } = parsed.data;
  const id = params.id;

  const existing = await prisma.appUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到帳號" }, { status: 404 });
  }

  if (session.userId === id && isActive === false) {
    return NextResponse.json({ error: "無法停用自己" }, { status: 400 });
  }
  if (session.userId === id && parsed.data.roleId && parsed.data.roleId !== existing.roleId) {
    return NextResponse.json({ error: "無法變更自己的角色" }, { status: 400 });
  }

  const data: {
    passwordHash?: string;
    roleId?: string;
    isActive?: boolean;
  } = {};
  if (password) data.passwordHash = await hashPassword(password);
  if (parsed.data.roleId !== undefined) {
    const roleRow = await prisma.role.findUnique({ where: { id: parsed.data.roleId }, select: { id: true } });
    if (!roleRow) return NextResponse.json({ error: "角色不存在" }, { status: 400 });
    data.roleId = roleRow.id;
  }
  if (isActive !== undefined) data.isActive = isActive;

  const user = await prisma.appUser.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      roleId: true,
      role: { select: { key: true, name: true } },
      legacyRole: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      roleId: user.roleId,
      roleKey: user.role?.key ?? String(user.legacyRole),
      roleName: user.role?.name ?? null,
      roleLabel:
        user.role?.name ??
        DEFAULT_ROLE_LABELS[user.role?.key ?? String(user.legacyRole)] ??
        (user.role?.key ?? String(user.legacyRole)),
      isActive: user.isActive,
    },
  });
}
