import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const id = params.id;
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "找不到角色" }, { status: 404 });

  const data: { name?: string; isActive?: boolean } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const updated = await prisma.role.update({
    where: { id },
    data,
    select: { id: true, key: true, name: true, isActive: true },
  });
  return NextResponse.json({ role: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const id = params.id;
  const existing = await prisma.role.findUnique({ where: { id }, select: { id: true, key: true } });
  if (!existing) return NextResponse.json({ error: "找不到角色" }, { status: 404 });

  // 安全：避免刪除 ADMIN（超管放行依 key）
  if (existing.key === "ADMIN") {
    return NextResponse.json({ error: "不可刪除 ADMIN 角色" }, { status: 400 });
  }

  const used = await prisma.appUser.findFirst({
    where: { roleId: id },
    select: { id: true },
  });
  if (used) {
    return NextResponse.json({ error: "此角色仍被使用者指派，無法刪除" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}

