import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { ROLE_KEYS } from "@/lib/roles";
import { assertRoles, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN);
  if (roleDenied) return roleDenied;

  const supervisorRole = await prisma.role.findUnique({
    where: { key: ROLE_KEYS.SUPERVISOR },
    select: { id: true },
  });

  const users = await prisma.appUser.findMany({
    where: supervisorRole ? { roleId: supervisorRole.id } : { id: "__none__" },
    select: {
      id: true,
      username: true,
      isActive: true,
      supervisorStores: {
        select: {
          storeId: true,
          store: { select: { storeName: true, region: true } },
        },
      },
    },
    orderBy: { username: "asc" },
  });

  return NextResponse.json({
    items: users.map((u) => ({
      id: u.id,
      username: u.username,
      isActive: u.isActive,
      stores: u.supervisorStores.map((s) => ({
        storeId: s.storeId,
        storeName: s.store.storeName,
        region: s.store.region,
      })),
    })),
  });
}

const postSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(6).max(128),
  storeIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN);
  if (roleDenied) return roleDenied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "欄位錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const supervisorRole = await prisma.role.findUnique({ where: { key: ROLE_KEYS.SUPERVISOR } });
  if (!supervisorRole) {
    return NextResponse.json({ error: "尚未建立 SUPERVISOR 角色，請先執行 seed" }, { status: 400 });
  }

  const exists = await prisma.appUser.findUnique({
    where: { username: parsed.data.username.trim() },
  });
  if (exists) {
    return NextResponse.json({ error: "此帳號已存在" }, { status: 409 });
  }

  const storeIds = [...new Set(parsed.data.storeIds)];
  const stores = await prisma.retailStore.findMany({
    where: { id: { in: storeIds }, isActive: true },
    select: { id: true },
  });
  if (stores.length !== storeIds.length) {
    return NextResponse.json({ error: "部分門市不存在或已停用" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.appUser.create({
      data: {
        username: parsed.data.username.trim(),
        passwordHash,
        roleId: supervisorRole.id,
        legacyRole: "EDITOR",
      },
    });
    await tx.supervisorStore.createMany({
      data: storeIds.map((storeId) => ({
        supervisorId: created.id,
        storeId,
      })),
    });
    return created;
  });

  return NextResponse.json({ id: user.id, username: user.username }, { status: 201 });
}
