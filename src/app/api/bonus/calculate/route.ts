import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calculateMonthlyBonus,
  saveMonthlyBonusResults,
} from "@/modules/bonus/services/bonus-engine.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "格式需為 YYYY-MM"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yearMonth } = bodySchema.parse(body);

    const results = await calculateMonthlyBonus(yearMonth);
    await saveMonthlyBonusResults(yearMonth, results);

    return NextResponse.json({ success: true, count: results.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
