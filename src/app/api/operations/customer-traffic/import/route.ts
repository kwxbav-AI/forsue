import { NextRequest, NextResponse } from "next/server";
import { importCustomerTrafficFromExcel } from "@/modules/operations/services/customer-traffic-import.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json({ error: "請選擇 Excel 檔案" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importCustomerTrafficFromExcel(buffer);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/operations/customer-traffic/import failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "匯入失敗" },
      { status: 500 }
    );
  }
}
