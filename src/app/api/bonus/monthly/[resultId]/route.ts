import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  accountabilityRatio: z.number().min(0).max(2),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { resultId: string } }
) {
  try {
    const body = await request.json();
    const { accountabilityRatio } = patchSchema.parse(body);

    const existing = await prisma.monthlyBonusResult.findUnique({
      where: { id: params.resultId },
    });
    if (!existing) {
      return NextResponse.json({ error: "找不到獎金記錄" }, { status: 404 });
    }

    const finalBonus = new Decimal(existing.subtotalBonus)
      .mul(existing.bonusMultiplier)
      .mul(accountabilityRatio)
      .toDecimalPlaces(0)
      .toNumber();

    const updated = await prisma.monthlyBonusResult.update({
      where: { id: params.resultId },
      data: { accountabilityRatio, finalBonus },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
