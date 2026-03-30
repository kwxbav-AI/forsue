import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hashPassword } from "@/lib/password";
import { USER_ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function requireAdmin(session: Awaited<ReturnType<typeof getSessionFromRequest>>) {
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  return null;
}

const patchSchema = z.object({
  password: z.string().min(6).max(128).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(req);
  const denied = requireAdmin(session);
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

  const { password, role, isActive } = parsed.data;
  const id = params.id;

  const existing = await prisma.appUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到帳號" }, { status: 404 });
  }

  if (session.userId === id && isActive === false) {
    return NextResponse.json({ error: "無法停用自己" }, { status: 400 });
  }
  if (session.userId === id && role && role !== existing.role) {
    return NextResponse.json({ error: "無法變更自己的角色" }, { status: 400 });
  }

  const data: {
    passwordHash?: string;
    role?: UserRole;
    isActive?: boolean;
  } = {};
  if (password) data.passwordHash = await hashPassword(password);
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;

  const user = await prisma.appUser.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    user: { ...user, roleLabel: USER_ROLE_LABELS[user.role] },
  });
}
