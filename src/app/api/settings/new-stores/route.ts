import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string(),
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guaranteeMonths: z.number().int().min(1).max(24).default(5),
  dailyGuarantee: z.number().positive().default(2640),
});

export async function GET() {
  const settings = await prisma.newStoreSetting.findMany({
    include: { store: { select: { id: true, name: true, department: true } } },
    orderBy: { openDate: "desc" },
  });
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = bodySchema.parse(body);

    const setting = await prisma.newStoreSetting.upsert({
      where: { storeId: data.storeId },
      update: {
        openDate: parseDateOnlyUTC(data.openDate),
        guaranteeMonths: data.guaranteeMonths,
        dailyGuarantee: data.dailyGuarantee,
      },
      create: {
        storeId: data.storeId,
        openDate: parseDateOnlyUTC(data.openDate),
        guaranteeMonths: data.guaranteeMonths,
        dailyGuarantee: data.dailyGuarantee,
      },
      include: { store: { select: { id: true, name: true, department: true } } },
    });
    return NextResponse.json(setting);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
