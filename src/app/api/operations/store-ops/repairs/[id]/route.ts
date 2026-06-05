import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertStoreAccess, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED"]).optional(),
  description: z.string().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.repairRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到報修單" }, { status: 404 });
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
  const now = new Date();
  const updated = await prisma.repairRequest.update({
    where: { id },
    data: {
      ...(parsed.data.description !== undefined ?
        { description: parsed.data.description?.trim() || null }
      : {}),
      status,
      resolvedAt: status === "RESOLVED" ? now : existing.resolvedAt,
      resolvedBy: status === "RESOLVED" ? auth.ctx.username : existing.resolvedBy,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(updated);
}
