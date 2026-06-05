import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertListQueryScope,
  buildStoreScopeWhere,
  requireStoreOps,
  resolveWriteStoreId,
} from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  storeId: z.string().min(1),
  equipment: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED"]).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const storeId = req.nextUrl.searchParams.get("storeId");
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  const list = await prisma.repairRequest.findMany({
    where: {
      ...buildStoreScopeWhere(auth.ctx, storeId),
      ...(status ? { status: status as "PENDING" | "IN_PROGRESS" | "RESOLVED" } : {}),
    },
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: { createdAt: "desc" },
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

  const created = await prisma.repairRequest.create({
    data: {
      storeId: resolved.storeId,
      equipment: parsed.data.equipment.trim(),
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status ?? "PENDING",
      createdBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(created, { status: 201 });
}
