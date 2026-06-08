import { NextRequest, NextResponse } from "next/server";
import {
  importStoreTargetsFromExcel,
  importStoreTargetsFromHeadcountExcel,
  importStoreTargetsFromSalesAndHeadcountExcel,
} from "@/modules/operations/services/store-target-import.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const targetFile =
      (formData.get("targetFile") as File | null) ??
      (formData.get("file") as File | null);
    const salesFile = formData.get("salesFile") as File | null;
    const hoursFile = formData.get("hoursFile") as File | null;
    const yearRaw = formData.get("year");
    const year = yearRaw ? Number(yearRaw) : 2026;

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "年份無效" }, { status: 400 });
    }

    let result;
    if (salesFile?.size && targetFile?.size) {
      const salesBuf = Buffer.from(await salesFile.arrayBuffer());
      const headcountBuf = Buffer.from(await targetFile.arrayBuffer());
      result = await importStoreTargetsFromSalesAndHeadcountExcel({
        year,
        salesFile: salesBuf,
        headcountFile: headcountBuf,
      });
    } else if (targetFile?.size) {
      const buf = Buffer.from(await targetFile.arrayBuffer());
      result = await importStoreTargetsFromHeadcountExcel({ year, file: buf });
    } else if (salesFile?.size && hoursFile?.size) {
      const salesBuf = Buffer.from(await salesFile.arrayBuffer());
      const hoursBuf = Buffer.from(await hoursFile.arrayBuffer());
      result = await importStoreTargetsFromExcel({
        year,
        salesFile: salesBuf,
        hoursFile: hoursBuf,
      });
    } else {
      return NextResponse.json(
        {
          error:
            "請同時上傳「月業績目標」與「目標工時（依人力計算）」兩份 Excel",
        },
        { status: 400 }
      );
    }

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
