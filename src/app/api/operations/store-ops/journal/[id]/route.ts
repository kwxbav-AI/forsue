import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertStoreAccess, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.dailyReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到日誌" }, { status: 404 });
  }

  const denied = assertStoreAccess(auth.ctx, existing.storeId);
  if (denied) return denied;

  const now = new Date();
  const updated = await prisma.dailyReport.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: now,
      submittedBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(updated);
}
