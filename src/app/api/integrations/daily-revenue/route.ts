import { NextRequest, NextResponse } from "next/server";
import { validateRevenueImportKey } from "@/lib/api-key-auth";
import { formatDateOnly } from "@/lib/date";
import { parseRevenueSheet } from "@/modules/uploads/parsers/revenue.parser";
import { uploadDailyRevenue } from "@/modules/uploads/services/upload.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 匯入後會逐日重算績效

/**
 * POST /api/integrations/daily-revenue — 會計系統推送每日營收（交班結帳紀錄原檔）
 *
 * 呼叫方式：multipart/form-data，欄位 file（Excel 原檔）、uploadedBy（選填，會計系統操作者）
 * Header：X-API-Key: <REVENUE_IMPORT_API_KEY>
 *
 * 跟「資料上傳中心」的手動上傳共用 uploadDailyRevenue，解析／寫入／重算規則只有一份。
 * 唯一的差別：這條路一定要每列都有結帳單號才收。去重靠唯一索引 (storeId, revenueDate, checkoutNo)，
 * 但 PostgreSQL 的唯一索引把每個 NULL 當成不同值，沒有結帳單號的列重送就會重複寫入、營收翻倍。
 * 會計那邊有按鈕可以重按，所以這裡整份擋下，不讓任何一列進去。
 */
export async function POST(request: NextRequest) {
  // middleware 已經驗過；這裡再驗一次，避免哪天 middleware 改壞時整支變成免驗證寫入
  if (validateRevenueImportKey(request) !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string" || file.size === 0) {
      return NextResponse.json(
        { success: false, importedCount: 0, failedCount: 1, errors: [{ row: 0, message: "缺少檔案" }] },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    const parsed = parseRevenueSheet(buffer);
    const missing = parsed.data.filter((r) => !r.checkoutNo);
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 10)
        .map((r) => `${formatDateOnly(r.revenueDate)} 門市 ${r.storeCode}`)
        .join("、");
      return NextResponse.json(
        {
          success: false,
          importedCount: 0,
          failedCount: missing.length,
          errors: [
            {
              row: 0,
              field: "checkoutNo",
              message: `有 ${missing.length} 筆沒有結帳單號，為避免重複寫入，整份未匯入：${sample}${missing.length > 10 ? " …" : ""}`,
            },
          ],
        },
        { status: 422 }
      );
    }

    const by = String(formData.get("uploadedBy") ?? "").trim().slice(0, 50) || "unknown";
    const result = await uploadDailyRevenue(buffer, file.name, `會計系統:${by}`);
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/integrations/daily-revenue failed", e);
    return NextResponse.json(
      {
        success: false,
        importedCount: 0,
        failedCount: 1,
        errors: [{ row: 0, message: e instanceof Error ? e.message : "匯入失敗" }],
      },
      { status: 500 }
    );
  }
}
