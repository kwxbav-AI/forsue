import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type TrackingRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  storeName: string | null;
  region: string | null;
  currentGrade: string;
  targetGrade: string | null;
  hoursRequired: number | null;
  hoursCarryOver: number;
  carryOverDate: Date;
  dispatchHours: number;
  examDeductions: number;
  note: string | null;
};

/**
 * GET /api/promotion-tracking
 * 回傳員工跨店時數晉升追蹤資料。
 *
 * 總時數 = hoursCarryOver + DispatchRecord（carryOverDate 後）− PromotionExamRecord 扣除（carryOverDate 後）
 *
 * Query params:
 *   region?: "宜蘭區" | "桃園區"
 *   eligible?: "true"  // 只顯示時數已達標可報考的人
 */
export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region") ?? null;
  const eligibleOnly = request.nextUrl.searchParams.get("eligible") === "true";

  const regionFilter = region
    ? Prisma.sql`AND rs.region = ${region}`
    : Prisma.sql``;

  const trackings = await prisma.$queryRaw<TrackingRow[]>(Prisma.sql`
    SELECT
      t."employeeId",
      e.name                                              AS "employeeName",
      e."employeeCode",
      s.name                                              AS "storeName",
      rs.region,
      t."currentGrade",
      t."targetGrade",
      CAST(t."hoursRequired"  AS FLOAT)                  AS "hoursRequired",
      CAST(t."hoursCarryOver" AS FLOAT)                  AS "hoursCarryOver",
      t."carryOverDate",
      CAST(COALESCE(d.total, 0) AS FLOAT)                AS "dispatchHours",
      CAST(COALESCE(ex.total, 0) AS FLOAT)               AS "examDeductions",
      t.note
    FROM "EmployeePromotionTracking" t
    JOIN "Employee" e ON e.id = t."employeeId"
    LEFT JOIN LATERAL (
      SELECT d2."fromStoreId"
      FROM "DispatchRecord" d2
      WHERE d2."employeeId" = t."employeeId"
        AND d2."fromStoreId" IS NOT NULL
      GROUP BY d2."fromStoreId"
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) home ON TRUE
    LEFT JOIN "Store" s ON s.id = COALESCE(e."defaultStoreId", home."fromStoreId")
    LEFT JOIN stores rs ON rs.store_name = s.name
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(d2."actualHours", d2."dispatchHours")), 0) AS total
      FROM "DispatchRecord" d2
      WHERE d2."employeeId" = t."employeeId"
        AND d2."workDate" > t."carryOverDate"
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ex2."hoursDeducted"), 0) AS total
      FROM "PromotionExamRecord" ex2
      WHERE ex2."employeeId" = t."employeeId"
        AND ex2."examDate" > t."carryOverDate"
    ) ex ON TRUE
    WHERE rs.region IS NOT NULL
      AND rs.region NOT IN ('台北區')
      ${regionFilter}
    ORDER BY rs.region, s.name, e.name
  `);

  const results = trackings.map((t) => {
    const totalHours = Math.max(0, t.hoursCarryOver + t.dispatchHours - t.examDeductions);
    const hoursRequired = t.hoursRequired ?? null;
    const remaining =
      hoursRequired !== null ? Math.max(0, hoursRequired - totalHours) : null;
    const eligible = hoursRequired !== null ? totalHours >= hoursRequired : null;
    return {
      employeeId: t.employeeId,
      employeeName: t.employeeName,
      employeeCode: t.employeeCode,
      storeName: t.storeName,
      region: t.region,
      currentGrade: t.currentGrade,
      targetGrade: t.targetGrade,
      hoursRequired,
      hoursCarryOver: Math.round(t.hoursCarryOver * 10) / 10,
      carryOverDate: t.carryOverDate,
      dispatchHours: Math.round(t.dispatchHours * 10) / 10,
      examDeductions: Math.round(t.examDeductions * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      hoursRemaining: remaining !== null ? Math.round(remaining * 10) / 10 : null,
      eligible,
      note: t.note,
    };
  });

  const filtered = eligibleOnly ? results.filter((r) => r.eligible === true) : results;
  return NextResponse.json(filtered);
}
