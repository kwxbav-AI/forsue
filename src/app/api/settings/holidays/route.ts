import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, formatDateOnly } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await prisma.holiday.findMany({
    orderBy: { date: "asc" },
  });
  return NextResponse.json(
    list.map((h) => ({
      id: h.id,
      date: formatDateOnly(h.date),
      name: h.name,
      isActive: h.isActive,
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dateStr = (body.date as string | undefined)?.trim();
    const name = (body.name as string | undefined)?.trim() || "假日";
    if (!dateStr) {
      return NextResponse.json({ error: "請提供 date (YYYY-MM-DD)" }, { status: 400 });
    }
    // 以 UTC 0 點儲存，避免因伺服器時區/ISO 轉換造成日期少一天
    const date = parseDateOnlyUTC(dateStr);

    const holiday = await prisma.holiday.upsert({
      where: { date },
      update: { name, isActive: true },
      create: { date, name, isActive: true },
    });

    return NextResponse.json({
      id: holiday.id,
      date: formatDateOnly(holiday.date),
      name: holiday.name,
      isActive: holiday.isActive,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "儲存假日失敗" },
      { status: 500 }
    );
  }
}

