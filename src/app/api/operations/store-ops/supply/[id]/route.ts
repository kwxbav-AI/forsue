import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLE_KEYS } from "@/lib/roles";
import { assertRoles, assertStoreAccess, canAccessStore, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), rejectReason: z.string().min(1) }),
  z.object({ action: z.literal("ship") }),
  z.object({ action: z.literal("receive") }),
]);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.supplyRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到物資申請" }, { status: 404 });
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

  const now = new Date();
  const { action } = parsed.data;

  if (action === "approve" || action === "reject") {
    const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPERVISOR);
    if (roleDenied) return roleDenied;
    const storeDenied = assertStoreAccess(auth.ctx, existing.storeId);
    if (storeDenied) return storeDenied;
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "僅待審核申請可簽核" }, { status: 400 });
    }

    const updated = await prisma.supplyRequest.update({
      where: { id },
      data:
        action === "approve" ?
          {
            status: "APPROVED",
            reviewedAt: now,
            reviewedBy: auth.ctx.username,
            rejectReason: null,
          }
        : {
            status: "REJECTED",
            reviewedAt: now,
            reviewedBy: auth.ctx.username,
            rejectReason: parsed.data.rejectReason.trim(),
          },
      include: { store: { select: { storeName: true, region: true } } },
    });
    return NextResponse.json(updated);
  }

  if (action === "ship") {
    const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN, ROLE_KEYS.LOGISTICS);
    if (roleDenied) return roleDenied;
    if (existing.status !== "APPROVED") {
      return NextResponse.json({ error: "僅已核准申請可出貨" }, { status: 400 });
    }

    const updated = await prisma.supplyRequest.update({
      where: { id },
      data: {
        status: "SHIPPED",
        shippedAt: now,
        shippedBy: auth.ctx.username,
      },
      include: { store: { select: { storeName: true, region: true } } },
    });
    return NextResponse.json(updated);
  }

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN, ROLE_KEYS.STORE_STAFF);
  if (roleDenied) return roleDenied;
  if (!canAccessStore(auth.ctx, existing.storeId)) {
    return NextResponse.json({ error: "僅申請門市可確認收貨" }, { status: 403 });
  }
  if (existing.status !== "SHIPPED") {
    return NextResponse.json({ error: "僅已出貨申請可確認收貨" }, { status: 400 });
  }

  const updated = await prisma.supplyRequest.update({
    where: { id },
    data: {
      status: "RECEIVED",
      receivedAt: now,
      receivedBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });
  return NextResponse.json(updated);
}
