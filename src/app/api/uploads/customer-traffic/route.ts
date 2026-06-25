import { NextRequest, NextResponse } from "next/server";
import { importCustomerTrafficFromExcel } from "@/modules/operations/services/customer-traffic-import.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 資料上傳中心：來客數／平均客單 Excel */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file?.size) {
      return NextResponse.json(
        { success: false, errors: [{ row: 0, message: "請選擇 Excel 檔案" }] },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importCustomerTrafficFromExcel(buffer);

    await prisma.uploadBatch.create({
      data: {
        fileType: "CUSTOMER_TRAFFIC",
        originalName: file.name,
        storedName: file.name,
        recordCount: result.upserted,
        status: "SUCCESS",
      },
    });

    return NextResponse.json({
      success: true,
      importedCount: result.upserted,
      message: result.message,
      warnings: result.warnings,
      unmatchedDepartments: result.unmatchedDepartments,
      skipped: result.skipped,
    });
  } catch (e) {
    console.error("POST /api/uploads/customer-traffic failed", e);
    return NextResponse.json(
      {
        success: false,
        errors: [{ row: 0, message: e instanceof Error ? e.message : "匯入失敗" }],
      },
      { status: 500 }
    );
  }
}
