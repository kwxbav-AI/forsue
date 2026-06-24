import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay, parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { getSessionFromRequest } from "@/lib/auth-request";
import {
  creatorDisplayName,
  formatFilledAtTaipei,
  resolveCreatorNamesByCode,
} from "@/lib/record-creator-meta";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  workDate: z.string(),
  storeId: z.string(),
  reason: z.enum(["EXPIRY", "CLEANING", "INVENTORY_REGISTRATION", "OTHER"]),
  hours: z.number().min(0),
  note: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const latest = searchParams.get("latest");
  const takeParam = searchParams.get("take");
  const storeIdFilter = searchParams.get("storeId");
  const where: { workDate?: { gte: Date; lte: Date }; storeId?: string } = {};
  if (startDate && endDate) {
    const start = parseDateOnlyUTC(startDate);
    const end = parseDateOnlyUTC(endDate);
    where.workDate = { gte: start, lte: end };
  }
  if (storeIdFilter) where.storeId = storeIdFilter;

  const isLatestMode = !where.workDate && latest === "1";
  const takeRequested = takeParam ? parseInt(takeParam, 10) : NaN;
  const take =
    Number.isFinite(takeRequested) && takeRequested > 0
      ? Math.min(500, Math.max(1, takeRequested))
      : isLatestMode
        ? 50
        : undefined;

  const list = await prisma.storeHourDeduction.findMany({
    where,
    include: { store: { select: { id: true, name: true, code: true } } },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    ...(take ? { take } : {}),
  });
  const creatorCodes = list.map((r) => r.createdBy?.trim()).filter(Boolean) as string[];
  const nameByCode = await resolveCreatorNamesByCode(creatorCodes);
  return NextResponse.json(
    list.map((r) => ({
      id: r.id,
      workDate: formatDateOnly(r.workDate),
      storeId: r.storeId,
      storeName: r.store.name,
      storeCode: r.store.code,
      reason: r.reason,
      hours: Number(r.hours),
      note: r.note,
      createdByCode: r.createdBy?.trim() || null,
      createdByName: creatorDisplayName(r.createdBy, nameByCode),
      filledAt: formatFilledAtTaipei(r.createdAt),
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workDate, storeId, reason, hours, note } = parsed.data;
    const d = toStartOfDay(workDate);
    const hoursVal = Number(hours);
    const created = await prisma.storeHourDeduction.create({
      data: {
        workDate: d,
        storeId,
        reason,
        hours: Number.isFinite(hoursVal) ? Math.round(hoursVal * 100) / 100 : 0,
        note: note?.trim() || null,
        createdBy: session?.username?.trim() || null,
      },
      include: { store: { select: { name: true, code: true } } },
    });
    await performanceEngineService.recalculateDailyPerformance(d);
    const nameByCode = await resolveCreatorNamesByCode(
      created.createdBy ? [created.createdBy] : []
    );
    return NextResponse.json({
      id: created.id,
      workDate: formatDateOnly(created.workDate),
      storeId: created.storeId,
      storeName: created.store.name,
      storeCode: created.store.code,
      reason: created.reason,
      hours: Number(created.hours),
      note: created.note,
      createdByCode: created.createdBy?.trim() || null,
      createdByName: creatorDisplayName(created.createdBy, nameByCode),
      filledAt: formatFilledAtTaipei(created.createdAt),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 }
    );
  }
}
