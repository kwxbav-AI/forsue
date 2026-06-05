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
  reportDate: z.string(),
  mainWork: z.string().optional().nullable(),
  anomaly: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const date = req.nextUrl.searchParams.get("date")?.trim();
  const storeId = req.nextUrl.searchParams.get("storeId");
  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  const list = await prisma.dailyReport.findMany({
    where: {
      ...buildStoreScopeWhere(auth.ctx, storeId),
      ...(date ? { reportDate: parseDateOnlyUTC(date) } : {}),
    },
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }],
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

  const status = parsed.data.status ?? "DRAFT";
  const now = new Date();
  const reportDate = parseDateOnlyUTC(parsed.data.reportDate);

  const row = await prisma.dailyReport.upsert({
    where: {
      storeId_reportDate: {
        storeId: resolved.storeId,
        reportDate,
      },
    },
    create: {
      storeId: resolved.storeId,
      reportDate,
      mainWork: parsed.data.mainWork?.trim() || null,
      anomaly: parsed.data.anomaly?.trim() || null,
      status,
      submittedAt: status === "SUBMITTED" ? now : null,
      submittedBy: status === "SUBMITTED" ? auth.ctx.username : null,
    },
    update: {
      mainWork: parsed.data.mainWork?.trim() || null,
      anomaly: parsed.data.anomaly?.trim() || null,
      status,
      submittedAt: status === "SUBMITTED" ? now : undefined,
      submittedBy: status === "SUBMITTED" ? auth.ctx.username : undefined,
    },
    include: { store: { select: { storeName: true, region: true } } },
  });

  return NextResponse.json(row, { status: 201 });
}
