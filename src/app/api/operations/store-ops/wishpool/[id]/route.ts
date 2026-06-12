import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLE_KEYS } from "@/lib/roles";
import { assertRoles, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.union([
  z.object({ action: z.literal("endorse") }),
  z.object({
    purchaseReply: z.string().min(1),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.wishItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到許願項目" }, { status: 404 });
  }

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

  if ("action" in parsed.data && parsed.data.action === "endorse") {
    const updated = await prisma.wishItem.update({
      where: { id },
      data: { endorseCount: { increment: 1 } },
      include: { store: { select: { storeName: true, region: true } } },
    });
    return NextResponse.json(updated);
  }

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN);
  if (roleDenied) return roleDenied;

  const purchaseReply =
    "purchaseReply" in parsed.data ? parsed.data.purchaseReply.trim() : "";
  if (!purchaseReply) {
    return NextResponse.json({ error: "缺少 purchaseReply" }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.wishItem.update({
    where: { id },
    data: {
      purchaseReply,
      repliedBy: auth.ctx.username,
      repliedAt: now,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(updated);
}
