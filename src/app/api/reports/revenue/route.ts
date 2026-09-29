import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  toDateRange,
} from "@/lib/date";
import { validateApiKey } from "@/lib/api-key-auth";
import { listNorthRegionPerformanceStores } from "@/modules/operations/services/operations-metrics.service";
import { isAuthEnabled } from "@/lib/auth-config";
import { getSessionFromRequest } from "@/lib/auth-request";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 支援兩種認證方式：
  // 1. Cookie session（網頁使用者）
  // 2. X-API-Key header（外部系統，需設 EXTERNAL_API_KEY 環境變數）
  let isExternalApiCaller = false;
  if (isAuthEnabled()) {
    const apiKeyResult = validateApiKey(request);
    if (apiKeyResult === "unauthorized") {
      // 有帶金鑰但不正確 → 直接拒絕，不回退（避免掩蓋外部系統的設定錯誤）
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (apiKeyResult !== "ok") {
      // "disabled"（未設環境變數）或 "absent"（網頁使用者，不會送此 header）
      // → 回退到 cookie session 驗證
      const session = await getSessionFromRequest(request);
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // 外部系統 API Key 驗證通過
      isExternalApiCaller = true;
    }
  }

  const { searchParams } = new URL(request.url);

  const todayStr = formatDateOnlyTaipei();
  const startDate = searchParams.get("startDate") || todayStr;
  const endDate = searchParams.get("endDate") || startDate;
  const department = searchParams.get("department")?.trim() || "";

  let start: Date;
  let end: Date;
  try {
    // 營收匯入以 toStartOfDay（UTC 日曆日）寫入 @db.Date，須用 UTC 區間；勿用台北區間（會誤含前一日）
    ({ start, end } = toDateRange(startDate, endDate));
  } catch {
    return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });
  }

  try {
    // 台北區門市（嘉興／虎林／萬隆／福德）在資料庫是 hideInReports = true，
    // 用意是不出現在內部報表與獎金池計算裡，因此預設會被下面的篩選濾掉。
    // 但外部系統（店務平台）的每日會計核實需要含台北區，所以只在「帶金鑰的外部
    // 呼叫」時把這幾家補回來；網頁使用者看到的內容維持原樣不變。
    //
    // 刻意不改動 Store.hideInReports 欄位本身：那個欄位是全域的，一旦取消勾選，
    // 台北區會同時被算進營運成果獎金池與所有內部報表，造成獎金金額變動。
    // 門市清單沿用北區 Dashboard 的定義（OPS_REGION_CATALOG），兩邊保持一致。
    const northStoreIds = isExternalApiCaller
      ? (await listNorthRegionPerformanceStores()).map((s) => s.id)
      : [];

    const records = await prisma.revenueRecord.findMany({
      where: {
        revenueDate: {
          gte: start,
          lte: end,
        },
        store: {
          OR: [
            { hideInReports: false as any },
            ...(northStoreIds.length
              ? [{ id: { in: northStoreIds } }]
              : []),
          ],
          ...(department
            ? {
                department: {
                  contains: department,
                  mode: "insensitive",
                },
              }
            : {}),
        },
      },
      include: {
        store: true,
      },
      orderBy: [
        { revenueDate: "asc" },
        { store: { name: "asc" } },
      ],
    });

    const rows = records.map((r) => {
      const revenueAmount = Number(r.revenueAmount);
      const cashIncome = Number(r.cashIncome);
      const linePayAmount = Number(r.linePayAmount);
      const refundAmount = Number(r.expenseAmount);
      const shortOver =
        revenueAmount - cashIncome - linePayAmount - refundAmount;

      return {
        id: r.id,
        storeName: r.store.name,
        department: r.store.department ?? "",
        revenueDate: formatDateOnly(r.revenueDate),
        revenueAmount,
        cashIncome,
        linePayAmount,
        refundAmount,
        shortOver,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/reports/revenue failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}

