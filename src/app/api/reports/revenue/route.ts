import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  toDateRange,
} from "@/lib/date";
import { validateApiKey } from "@/lib/api-key-auth";
import { isAuthEnabled } from "@/lib/auth-config";
import { getSessionFromRequest } from "@/lib/auth-request";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 支援兩種認證方式：
  // 1. Cookie session（網頁使用者）
  // 2. X-API-Key header（外部系統，需設 EXTERNAL_API_KEY 環境變數）
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
    }
    // apiKeyResult === "ok" → 外部系統 API Key 驗證通過
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
    const records = await prisma.revenueRecord.findMany({
      where: {
        revenueDate: {
          gte: start,
          lte: end,
        },
        store: {
          hideInReports: false as any,
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

