import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, formatDateOnlyTaipei, parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const todayStr = formatDateOnlyTaipei();
  const startDate = searchParams.get("startDate") || todayStr;
  const endDate = searchParams.get("endDate") || startDate;
  const department = searchParams.get("department")?.trim() || "";

  let start: Date;
  let end: Date;
  try {
    start = parseDateOnlyUTC(startDate);
    end = parseDateOnlyUTC(endDate);
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

