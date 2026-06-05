import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import {
  assertListQueryScope,
  buildStoreScopeWhere,
  requireStoreOps,
  resolveWriteStoreId,
} from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  storeId: z.string().min(1),
  itemName: z.string().min(1),
  quantity: z.string().optional().nullable(),
  neededDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const storeId = req.nextUrl.searchParams.get("storeId");
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  const list = await prisma.supplyRequest.findMany({
    where: {
      ...buildStoreScopeWhere(auth.ctx, storeId),
      ...(status ?
        { status: status as "PENDING" | "APPROVED" | "REJECTED" | "SHIPPED" | "RECEIVED" }
      : {}),
    },
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ items: list });
}

export async function POST(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

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

  const resolved = resolveWriteStoreId(auth.ctx, parsed.data.storeId);
  if ("error" in resolved) return resolved.error;

  const created = await prisma.supplyRequest.create({
    data: {
      storeId: resolved.storeId,
      itemName: parsed.data.itemName.trim(),
      quantity: parsed.data.quantity?.trim() || null,
      neededDate: parsed.data.neededDate ? parseDateOnlyUTC(parsed.data.neededDate) : null,
      note: parsed.data.note?.trim() || null,
      status: "PENDING",
      submittedBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(created, { status: 201 });
}
