import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import type { UserRole } from "@prisma/client";

const roleSchema = z.nativeEnum({
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  STORE_STAFF: "STORE_STAFF",
});

function requireAdmin(session: Awaited<ReturnType<typeof getSessionFromRequest>>) {
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const roleParam = searchParams.get("role") ?? "STORE_STAFF";
  const parsedRole = roleSchema.safeParse(roleParam);
  if (!parsedRole.success) {
    return NextResponse.json({ error: "角色參數錯誤" }, { status: 400 });
  }
  const role = parsedRole.data as UserRole;

  const modules = await prisma.permissionModule.findMany({
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
  });

  const moduleIds = modules.map((m) => m.id);
  const rolePerms = await prisma.rolePermission.findMany({
    where: { role, moduleId: { in: moduleIds } },
    select: { moduleId: true, canRead: true, canWrite: true },
  });
  const permMap = new Map<string, { canRead: boolean; canWrite: boolean }>();
  for (const p of rolePerms) {
    permMap.set(p.moduleId, { canRead: p.canRead, canWrite: p.canWrite });
  }

  return NextResponse.json({
    role,
    modules: modules.map((m) => {
      const perm = permMap.get(m.id) ?? { canRead: false, canWrite: false };
      return {
        id: m.id,
        key: m.key,
        label: m.label,
        description: m.description,
        groupKey: m.groupKey,
        sortOrder: m.sortOrder,
        parentId: m.parentId,
        ...perm,
      };
    }),
  });
}

const updateSchema = z.object({
  role: z.string(),
  updates: z.array(
    z.object({
      moduleId: z.string(),
      canRead: z.boolean(),
      canWrite: z.boolean(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const roleParsed = roleSchema.safeParse(parsed.data.role);
  if (!roleParsed.success) {
    return NextResponse.json({ error: "角色參數錯誤" }, { status: 400 });
  }
  const role = roleParsed.data as UserRole;

  // 寫入包含讀取：強制 canRead=true 若 canWrite=true
  const updates = parsed.data.updates.map((u) => ({
    moduleId: u.moduleId,
    canWrite: u.canWrite,
    canRead: u.canRead || u.canWrite,
  }));

  await prisma.$transaction(
    updates.map((u) =>
      prisma.rolePermission.upsert({
        where: { role_moduleId: { role, moduleId: u.moduleId } },
        update: { canRead: u.canRead, canWrite: u.canWrite },
        create: { role, moduleId: u.moduleId, canRead: u.canRead, canWrite: u.canWrite },
      })
    )
  );

  return NextResponse.json({ ok: true });
}

