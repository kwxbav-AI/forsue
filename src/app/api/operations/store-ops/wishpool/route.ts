import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildStoreScopeWhere,
  requireStoreOps,
  resolveWriteStoreId,
} from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  storeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const storeId = req.nextUrl.searchParams.get("storeId");

  const list = await prisma.wishItem.findMany({
    where: buildStoreScopeWhere(auth.ctx, storeId),
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: [{ endorseCount: "desc" }, { createdAt: "desc" }],
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

  const created = await prisma.wishItem.create({
    data: {
      storeId: resolved.storeId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      createdBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(created, { status: 201 });
}
