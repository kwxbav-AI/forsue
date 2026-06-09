import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildShiftPlanMonth } from "@/modules/supervisor/services/shift-plan-calendar.service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z.string().min(1),
  storeId: z.string().optional(),
  region: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      month: searchParams.get("month") ?? "",
      storeId: searchParams.get("storeId") ?? undefined,
      region: searchParams.get("region") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = await buildShiftPlanMonth({
      month: parsed.data.month.trim(),
      storeId: parsed.data.storeId?.trim() || null,
      region: parsed.data.region?.trim() || null,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/operations/shift-plans/month failed", error);
    const msg = error instanceof Error ? error.message : "查詢失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
