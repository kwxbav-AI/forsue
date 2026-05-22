import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { computeRplhTarget } from "@/lib/operations";
import { serializeStoreTarget } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  salesTarget: z.number().positive(),
  laborHourTarget: z.number().positive(),
  note: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") ?? undefined;
  const yearStr = request.nextUrl.searchParams.get("year");
  const monthStr = request.nextUrl.searchParams.get("month");
  const year = yearStr ? Number(yearStr) : undefined;
  const month = monthStr ? Number(monthStr) : undefined;

  const list = await prisma.storeTarget.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(year ? { year } : {}),
      ...(month ? { month } : {}),
    },
    include: { store: { select: { storeName: true, region: true } } },
    orderBy: month
      ? [{ year: "desc" }, { month: "desc" }, { store: { storeName: "asc" } }]
      : [{ store: { storeName: "asc" } }, { month: "asc" }],
  });
  return NextResponse.json(list.map(serializeStoreTarget));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { storeId, year, month, salesTarget, laborHourTarget, note } = parsed.data;
    const rplh = computeRplhTarget(salesTarget, laborHourTarget);

    const created = await prisma.storeTarget.create({
      data: {
        storeId,
        year,
        month,
        salesTarget,
        laborHourTarget,
        rplhTarget: rplh,
        note: note?.trim() || null,
      },
      include: { store: { select: { storeName: true, region: true } } },
    });
    return NextResponse.json(serializeStoreTarget(created), { status: 201 });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "新增目標失敗";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "此門市在該年月已有目標設定" },
        { status: 409 }
      );
    }
    if (msg.includes("Foreign key")) {
      return NextResponse.json({ error: "門市不存在" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
