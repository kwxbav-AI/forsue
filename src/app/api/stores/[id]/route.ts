import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  aliases: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
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
      return withAliases ?? store;
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // 不能硬刪：門市可能被歷史績效/營收引用
    // 改採「停用」(soft delete)，保留歷史資料一致性
    await prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id },
        data: { isActive: false },
      });
      // 停用時保留 aliases 也可；這裡先保留，避免歷史匯入對不到
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}

