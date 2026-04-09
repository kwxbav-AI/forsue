import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";
import { performDeletionForTarget } from "@/lib/deletion-request-service";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  aliases: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

function toSnapshot(
  store: { name: string; department: string | null; isActive: boolean; code: string | null },
  aliases: { code: string }[]
) {
  return {
    name: store.name,
    department: store.department,
    isActive: store.isActive,
    code: store.code,
    aliases: aliases.map((a) => a.code).filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const session = await getSessionFromRequest(request);
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, department, aliases, isActive } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.store.findUnique({
        where: { id },
        include: { aliases: true },
      });
      if (!before) throw new Error("找不到門市");
      const beforeSnap = toSnapshot(before, (before as any).aliases ?? []);

      let primaryCode: string | null = null;
      if (aliases && aliases.length) {
        primaryCode = aliases[0].trim() || null;
      }

      const store = await tx.store.update({
        where: { id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(department !== undefined ? { department: (department ?? "").trim() || null } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(primaryCode !== null ? { code: primaryCode } : {}),
        },
      });

      if (aliases) {
        await tx.storeAlias.deleteMany({ where: { storeId: id } });
        const create = aliases
          .map((a) => a.trim())
          .filter(Boolean)
          .map((code) => ({ code, storeId: id }));
        if (create.length) {
          await tx.storeAlias.createMany({ data: create });
        }
      }

      const withAliases = await tx.store.findUnique({
        where: { id },
        include: { aliases: true },
      });
      const after = withAliases ?? store;
      const afterSnap = toSnapshot(after, Array.isArray((after as any).aliases) ? (after as any).aliases : []);

      if (JSON.stringify(beforeSnap) !== JSON.stringify(afterSnap)) {
        await tx.storeChangeLog.create({
          data: {
            storeId: id,
            action: "UPDATE",
            changedBy: session?.username ?? null,
            before: beforeSnap,
            after: afterSnap,
          },
        });
      }

      return after;
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      code: updated.code,
      department: updated.department,
      isActive: updated.isActive,
      aliases: Array.isArray((updated as any).aliases)
        ? (updated as any).aliases.map((a: any) => a.code)
        : [],
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失敗" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "未登入" }, { status: 401 });
    }

    const canApprove = await hasModuleEffectivePermission(
      session.role,
      "delete-approve-stores",
      "write"
    );

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      return NextResponse.json({ error: "找不到門市" }, { status: 404 });
    }

    if (canApprove) {
      await performDeletionForTarget("STORE", id, session.username);
      return NextResponse.json({ success: true });
    }

    const dup = await prisma.deletionRequest.findFirst({
      where: { targetType: "STORE", targetId: id, status: "PENDING" },
    });
    if (dup) {
      return NextResponse.json(
        {
          pending: true,
          requestId: dup.id,
          message: "已有待審停用申請",
        },
        { status: 202 }
      );
    }

    const created = await prisma.deletionRequest.create({
      data: {
        targetType: "STORE",
        targetId: id,
        status: "PENDING",
        requestedByUserId: session.userId,
        requestedByUsername: session.username,
      },
    });

    return NextResponse.json(
      {
        pending: true,
        requestId: created.id,
        message: "已送出停用申請，待核准後生效",
      },
      { status: 202 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}

