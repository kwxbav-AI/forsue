import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildSupportRequestsMonth } from "@/modules/supervisor/services/support-requests.service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z.string().min(1),
  store: z.string().optional(),
  storeId: z.string().optional(),
  region: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      month: searchParams.get("month") ?? "",
      store: searchParams.get("store") ?? undefined,
      storeId: searchParams.get("storeId") ?? undefined,
      region: searchParams.get("region") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const storeToken = (parsed.data.store ?? "").trim();
    const storeIdParam =
      (parsed.data.storeId ?? "").trim() ||
      (storeToken && storeToken !== "all" ? storeToken : "");

    const data = await buildSupportRequestsMonth({
      month: parsed.data.month.trim(),
      storeId: storeIdParam ? storeIdParam : null,
      region: parsed.data.region?.trim() ? parsed.data.region.trim() : null,
    });

    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查詢失敗" },
      { status: 500 }
    );
  }
}

