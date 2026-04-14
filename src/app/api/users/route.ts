import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hashPassword } from "@/lib/password";
import { DEFAULT_ROLE_LABELS } from "@/lib/permissions";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const users = await prisma.appUser.findMany({
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      roleId: true,
      role: { select: { id: true, key: true, name: true, isActive: true } },
      legacyRole: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      roleId: u.roleId,
      roleKey: u.role?.key ?? String(u.legacyRole),
      roleName: u.role?.name ?? null,
      roleLabel: u.role?.name ?? DEFAULT_ROLE_LABELS[u.role?.key ?? String(u.legacyRole)] ?? (u.role?.key ?? String(u.legacyRole)),
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
  });
}

const createSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6).max(128),
  roleId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "帳號至少 2 字元、密碼至少 6 字元，並選擇角色" },
      { status: 400 }
    );
  }

  const { username, password, roleId } = parsed.data;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, name: true } });
  if (!role) return NextResponse.json({ error: "角色不存在" }, { status: 400 });
  const exists = await prisma.appUser.findUnique({
    where: { username: username.trim() },
  });
  if (exists) {
    return NextResponse.json({ error: "此帳號已存在" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.appUser.create({
    data: {
      username: username.trim(),
      passwordHash,
      roleId: role.id,
      legacyRole: "EDITOR" as any,
    },
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
      roleLabel: user.role?.name ?? DEFAULT_ROLE_LABELS[user.role?.key ?? String(user.legacyRole)] ?? (user.role?.key ?? String(user.legacyRole)),
      isActive: user.isActive,
    },
  });
}
