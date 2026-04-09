import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hashPassword } from "@/lib/password";
import { USER_ROLE_LABELS } from "@/lib/permissions";
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
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      roleLabel: USER_ROLE_LABELS[u.role],
    })),
  });
}

const createSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6).max(128),
  role: z.nativeEnum(UserRole),
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

  const { username, password, role } = parsed.data;
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
      role,
    },
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
