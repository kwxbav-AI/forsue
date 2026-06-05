import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertStoreAccess, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "OVERDUE"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.todoItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到任務" }, { status: 404 });
  }

  const denied = assertStoreAccess(auth.ctx, existing.storeId);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "欄位錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const status = parsed.data.status ?? existing.status;
  const updated = await prisma.todoItem.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.description !== undefined ?
        { description: parsed.data.description?.trim() || null }
      : {}),
      status,
      completedAt: status === "DONE" ? new Date() : existing.completedAt,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(updated);
}
