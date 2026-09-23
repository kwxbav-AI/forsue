/**
 * POST /api/admin/promotion-tracking/seed
 *
 * 一次性回填腳本：將 Excel 截至 2026-02-28 的跨店時數匯入 EmployeePromotionTracking。
 * 執行一次即可，重複執行會 upsert（安全）。
 *
 * 6月升職邏輯：
 *   若員工系統職等 ≠ Excel 記錄職等（代表在 2026-02-28 後已升職），
 *   則 carryOver = max(0, AS欄 − 舊職等門檻)，剩餘時數可繼續累積。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key-auth";
import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";

const createId = () => randomBytes(14).toString("base64url");

// Excel 時數標準（鍵 = 目前職等，升職需要的跨店時數）
const GRADE_HOURS: Record<string, { target: string; hours: number }> = {
  "三級營業員": { target: "二級營業員", hours: 40 },
  "二級營業員": { target: "一級營業員", hours: 80 },
  "初階兼職":   { target: "進階兼職",   hours: 40 },
};

// Excel 截至 2026-02-28 的累計時數（已扣歷史考核扣除）
// 欄位：{ name, carryOver, excelGrade }
// excelGrade = Excel AT 欄（2026-03 的職等，即 6月升職前的職等）
const EXCEL_DATA = [
  { name: "石元甫",  carryOver: 249.09, excelGrade: "三級營業員" },
  { name: "林郁映",  carryOver: 97.9,   excelGrade: "二級營業員" },
  { name: "游雅筑",  carryOver: 2.93,   excelGrade: "進階兼職"   },
  { name: "陳怡瑄",  carryOver: 8.36,   excelGrade: "進階兼職"   },
  { name: "巫思樺",  carryOver: 25.63,  excelGrade: "三級營業員" },
  { name: "俞柔欣",  carryOver: 5.96,   excelGrade: "兼職新人"   },
  { name: "張郁琳",  carryOver: 21.85,  excelGrade: "兼職新人"   },
  { name: "王珮慈",  carryOver: 63.3,   excelGrade: "二級營業員" },
  { name: "游桄燿",  carryOver: 91.85,  excelGrade: "新進營業員" },
  { name: "曹家瑜",  carryOver: 0,      excelGrade: "新進營業員" },
  { name: "張郁",    carryOver: 225.43, excelGrade: "兼職新人"   },
  { name: "李珮茹",  carryOver: 34.95,  excelGrade: "新進營業員" },
  { name: "戴綺",    carryOver: 26.32,  excelGrade: "進階兼職"   },
  { name: "陳韻晴",  carryOver: 23.82,  excelGrade: "二級營業員" },
  { name: "江環宇",  carryOver: 51.15,  excelGrade: "副店長"     },
  { name: "廖祐君",  carryOver: 376.42, excelGrade: "二級營業員" },
  { name: "何芯瑩",  carryOver: 34.05,  excelGrade: "兼職新人"   },
  { name: "謝樂盈",  carryOver: 231.6,  excelGrade: "兼職新人"   },
  { name: "陳羿蓉",  carryOver: 3.28,   excelGrade: "初階兼職"   },
  { name: "簡千蕙",  carryOver: 28.94,  excelGrade: "二級營業員" },
  { name: "鄭鈺潔",  carryOver: 1.1,    excelGrade: "一級營業員" },
  { name: "景怡鈞",  carryOver: 35.3,   excelGrade: "進階兼職"   },
  { name: "游宣綺",  carryOver: 16.22,  excelGrade: "二級營業員" },
  { name: "趙沛淋",  carryOver: 98.05,  excelGrade: "進階兼職"   },
  { name: "王舒儀",  carryOver: 6.18,   excelGrade: "兼職新人"   },
  { name: "伍沛婷",  carryOver: 0,      excelGrade: "新進營業員" },
  { name: "林偉婷",  carryOver: 429.29, excelGrade: "二級營業員" },
  { name: "吳雅婷",  carryOver: 73.68,  excelGrade: "二級營業員" },
  { name: "林嘉琪",  carryOver: 300.94, excelGrade: "初階兼職"   },
  { name: "程佳欣",  carryOver: 158.37, excelGrade: "進階兼職"   },
  { name: "張彤緁",  carryOver: 71.55,  excelGrade: "三級營業員" },
  { name: "邱璵",    carryOver: 17.2,   excelGrade: "二級營業員" },
  { name: "王楚翔",  carryOver: 443.73, excelGrade: "新進營業員" },
  { name: "王盈嵐",  carryOver: 180.43, excelGrade: "三級營業員" },
  { name: "簡子琳",  carryOver: 9.25,   excelGrade: "三級營業員" },
  { name: "胡雅琴",  carryOver: 59.47,  excelGrade: "三級營業員" },
  { name: "趙家賢",  carryOver: 292.56, excelGrade: "一級營業員" },
  { name: "蔡育昀",  carryOver: 63.35,  excelGrade: "進階兼職"   },
  { name: "羅莉薇",  carryOver: 41.39,  excelGrade: "初階兼職"   },
  { name: "鄭儀琳",  carryOver: 23.21,  excelGrade: "二級營業員" },
  { name: "范鈺庭",  carryOver: 0,      excelGrade: "兼職新人"   },
  { name: "孫芷昕",  carryOver: 0,      excelGrade: "兼職新人"   },
  { name: "張珈寧",  carryOver: 87.97,  excelGrade: "三級營業員" },
  { name: "石佳蓉",  carryOver: 78.1,   excelGrade: "一級營業員" },
  { name: "陳子萱",  carryOver: 0,      excelGrade: "兼職新人"   },
  { name: "陳梓欣",  carryOver: 145.15, excelGrade: "二級營業員" },
  { name: "徐怡欣",  carryOver: 3.52,   excelGrade: "進階兼職"   },
  { name: "江惠如",  carryOver: 3.01,   excelGrade: "三級營業員" },
  { name: "曾燕茹",  carryOver: 73.48,  excelGrade: "初階兼職"   },
  { name: "黃雅貞",  carryOver: 24.68,  excelGrade: "新進營業員" },
  { name: "蔡羽婷",  carryOver: 89.75,  excelGrade: "兼職新人"   },
  { name: "游淑涵",  carryOver: 7.69,   excelGrade: "一級營業員" },
  { name: "黃暐博",  carryOver: 171.15, excelGrade: "兼職新人"   },
  { name: "許晴媁",  carryOver: 9.2,    excelGrade: "進階兼職"   },
  { name: "周士傑",  carryOver: 871.96, excelGrade: "兼職新人"   },
  { name: "謝羽婷",  carryOver: 0,      excelGrade: "新進營業員" },
  { name: "王少筠",  carryOver: 34.96,  excelGrade: "新進營業員" },
  { name: "徐維志",  carryOver: 167.65, excelGrade: "初階兼職"   },
  { name: "鄧曉郁",  carryOver: 0,      excelGrade: "新進營業員" },
  { name: "阮宥緁",  carryOver: 93.71,  excelGrade: "新進營業員" },
];

const EXCEL_MAP = new Map<string, (typeof EXCEL_DATA)[number]>(EXCEL_DATA.map((r) => [r.name, r]));
const CARRY_OVER_DATE = new Date("2026-02-28");

export async function POST(request: NextRequest) {
  const apiKeyResult = validateApiKey(request);
  if (apiKeyResult === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const employees = await prisma.employee.findMany({
    where: { leaveDate: null },
    select: { id: true, name: true, position: true },
  });

  const results: string[] = [];
  let inserted = 0;
  const unmatched: string[] = [];

  for (const emp of employees) {
    const excel = EXCEL_MAP.get(emp.name);
    const currentGrade = emp.position?.trim() || excel?.excelGrade || "";
    if (!currentGrade) continue;

    // 計算 carryOver
    let hoursCarryOver: number;
    let note: string | null = null;

    if (!excel) {
      // 不在 Excel（2月後新進），carryOver = 0
      hoursCarryOver = 0;
      note = "Excel 無記錄（2026-02 後新進），carryOver 從 0 開始";
      unmatched.push(emp.name);
    } else if (currentGrade === excel.excelGrade) {
      // 職等未變，直接用 Excel AS 欄
      hoursCarryOver = Math.max(0, excel.carryOver);
    } else {
      // 6月升職：扣掉舊職等門檻後剩餘時數繼續累積
      const prevHours = GRADE_HOURS[excel.excelGrade]?.hours ?? 0;
      hoursCarryOver = Math.max(0, excel.carryOver - prevHours);
      note = `6月升職：${excel.excelGrade}→${currentGrade}；AS=${excel.carryOver}，扣${prevHours}h後carryOver=${hoursCarryOver.toFixed(2)}`;
    }

    const { target: targetGrade = null, hours: hoursRequired = null } =
      GRADE_HOURS[currentGrade] ?? {};

    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeePromotionTracking"
        (id, "employeeId", "currentGrade", "targetGrade", "hoursRequired", "hoursCarryOver", "carryOverDate", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("employeeId") DO UPDATE SET
         "currentGrade"   = EXCLUDED."currentGrade",
         "targetGrade"    = EXCLUDED."targetGrade",
         "hoursRequired"  = EXCLUDED."hoursRequired",
         "hoursCarryOver" = EXCLUDED."hoursCarryOver",
         "carryOverDate"  = EXCLUDED."carryOverDate",
         note             = EXCLUDED.note,
         "updatedAt"      = CURRENT_TIMESTAMP`,
      createId(), emp.id, currentGrade, targetGrade,
      hoursRequired, hoursCarryOver, CARRY_OVER_DATE, note,
    );
    inserted++;
    results.push(`${emp.name}：${currentGrade}，carryOver=${hoursCarryOver.toFixed(1)}h${note ? `（${note}）` : ""}`);
  }

  return NextResponse.json({
    ok: true,
    inserted,
    unmatchedInExcel: unmatched,
    detail: results,
  });
}
