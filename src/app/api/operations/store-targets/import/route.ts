import { NextRequest, NextResponse } from "next/server";
import { importStoreTargetsFromExcel } from "@/modules/operations/services/store-target-import.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const salesFile = formData.get("salesFile") as File | null;
    const hoursFile = formData.get("hoursFile") as File | null;
    const yearRaw = formData.get("year");
    const year = yearRaw ? Number(yearRaw) : 2026;

    if (!salesFile?.size) {
      return NextResponse.json({ error: "請上傳「月業績目標」Excel 檔案" }, { status: 400 });
    }
    if (!hoursFile?.size) {
      return NextResponse.json({ error: "請上傳「月目標工時」Excel 檔案" }, { status: 400 });
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "年份無效" }, { status: 400 });
    }

    const salesBuf = Buffer.from(await salesFile.arrayBuffer());
    const hoursBuf = Buffer.from(await hoursFile.arrayBuffer());

    const result = await importStoreTargetsFromExcel({
      year,
      salesFile: salesBuf,
      hoursFile: hoursBuf,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message: `已更新 ${result.upserted} 筆門市月目標（${result.matchedStores} 間門市）`,
    });
  } catch (e) {
    console.error("POST /api/operations/store-targets/import failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "匯入失敗" },
      { status: 500 }
    );
  }
}
