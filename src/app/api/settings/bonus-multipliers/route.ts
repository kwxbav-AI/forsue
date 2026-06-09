import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DEFAULT_MULTIPLIERS = [
  { position: "進階兼職", multiplier: 1.4 },
  { position: "初階兼職", multiplier: 1.2 },
  { position: "兼職新人", multiplier: 1 },
  { position: "一級營業員", multiplier: 1.6 },
  { position: "二級營業員", multiplier: 1.4 },
  { position: "三級營業員", multiplier: 1.2 },
  { position: "新進營業員", multiplier: 1 },
  { position: "一級店長", multiplier: 1.8 },
  { position: "二級店長", multiplier: 1.7 },
  { position: "三級店長", multiplier: 1.7 },
  { position: "副店長", multiplier: 1.6 },
  { position: "兼職人員", multiplier: 1 },
  { position: "專員", multiplier: 1 },
  { position: "兼職-寒假短期工讀", multiplier: 0 },
  { position: "臨時理貨人員", multiplier: 1 },
  { position: "兼職-暑假短期工讀", multiplier: 0 },
  { position: "蔬果處理人員", multiplier: 1 },
];

export async function GET() {
  let rows = await prisma.bonusMultiplier.findMany({ orderBy: { position: "asc" } });
  if (rows.length === 0) {
    // 初始化預設值
    await prisma.bonusMultiplier.createMany({ data: DEFAULT_MULTIPLIERS });
    rows = await prisma.bonusMultiplier.findMany({ orderBy: { position: "asc" } });
  }
  return NextResponse.json(rows);
}

const putSchema = z.array(
  z.object({ position: z.string(), multiplier: z.number().min(0) })
);

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const items = putSchema.parse(body);

    await prisma.$transaction(
      items.map((item) =>
        prisma.bonusMultiplier.upsert({
          where: { position: item.position },
          update: { multiplier: item.multiplier },
          create: { position: item.position, multiplier: item.multiplier },
        })
      )
    );

    const rows = await prisma.bonusMultiplier.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
