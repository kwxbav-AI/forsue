import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import {
  assertListQueryScope,
  buildStoreListWhere,
  requireStoreOps,
  resolveWriteStoreId,
} from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  storeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "OVERDUE"]).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const storeId = req.nextUrl.searchParams.get("storeId");
  const region = req.nextUrl.searchParams.get("region");
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  const list = await prisma.todoItem.findMany({
    where: {
      ...buildStoreListWhere(auth.ctx, { storeId, region }),
      ...(status ? { status: status as "PENDING" | "IN_PROGRESS" | "DONE" | "OVERDUE" } : {}),
    },
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
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

  const created = await prisma.todoItem.create({
    data: {
      storeId: resolved.storeId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      dueDate: parsed.data.dueDate ? parseDateOnlyUTC(parsed.data.dueDate) : null,
      status: parsed.data.status ?? "PENDING",
      createdBy: auth.ctx.username,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(created, { status: 201 });
}
