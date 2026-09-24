/**
 * POST /api/admin/promotion-tracking/seed
 *
 * 回填腳本：依 2026-08-17 在職名冊匯入 EmployeePromotionTracking。
 * 重複執行安全（upsert）。
 *
 * currentGrade = 名冊 D 欄職稱（非系統職等）
 * carryOver = 舊 Excel 截至 2026-02-28 累計時數；若有升職則扣舊職等門檻。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

const createId = () => randomBytes(14).toString("base64url");

// 每個職等的下一個晉升目標（頂端職等不列入）
const GRADE_NEXT: Record<string, string> = {
  "新進營業員": "三級營業員",
  "三級營業員": "二級營業員",
  "二級營業員": "一級營業員",
  "兼職新人":   "初階兼職",
  "初階兼職":   "進階兼職",
  "副店長":     "三級店長",
  "三級店長":   "二級店長",
  "二級店長":   "一級店長",
};

// 需要跨店時數才能報考的職等門檻（其餘 hoursRequired = null）
const GRADE_CROSS_HOURS: Record<string, number> = {
  "三級營業員": 40,
  "二級營業員": 80,
  "初階兼職":   40,
};

// 2026-02-28 累計跨店時數（舊 Excel AS 欄）及當時職等
const CARRY_OVER_MAP = new Map([
  ["石元甫",  { carryOver: 249.09, oldGrade: "三級營業員" }],
  ["林郁映",  { carryOver: 97.9,   oldGrade: "二級營業員" }],
  ["游雅筑",  { carryOver: 2.93,   oldGrade: "進階兼職"   }],
  ["陳怡瑄",  { carryOver: 8.36,   oldGrade: "進階兼職"   }],
  ["巫思樺",  { carryOver: 25.63,  oldGrade: "三級營業員" }],
  ["俞柔欣",  { carryOver: 5.96,   oldGrade: "兼職新人"   }],
  ["張郁琳",  { carryOver: 21.85,  oldGrade: "兼職新人"   }],
  ["王珮慈",  { carryOver: 63.3,   oldGrade: "二級營業員" }],
  ["游桄燿",  { carryOver: 91.85,  oldGrade: "新進營業員" }],
  ["曹家瑜",  { carryOver: 0,      oldGrade: "新進營業員" }],
  ["張郁",    { carryOver: 225.43, oldGrade: "兼職新人"   }],
  ["李珮茹",  { carryOver: 34.95,  oldGrade: "新進營業員" }],
  ["戴綺",    { carryOver: 26.32,  oldGrade: "進階兼職"   }],
  ["陳韻晴",  { carryOver: 23.82,  oldGrade: "二級營業員" }],
  ["江環宇",  { carryOver: 51.15,  oldGrade: "副店長"     }],
  ["廖祐君",  { carryOver: 376.42, oldGrade: "二級營業員" }],
  ["何芯瑩",  { carryOver: 34.05,  oldGrade: "兼職新人"   }],
  ["謝樂盈",  { carryOver: 231.6,  oldGrade: "兼職新人"   }],
  ["陳羿蓉",  { carryOver: 3.28,   oldGrade: "初階兼職"   }],
  ["簡千蕙",  { carryOver: 28.94,  oldGrade: "二級營業員" }],
  ["鄭鈺潔",  { carryOver: 1.1,    oldGrade: "一級營業員" }],
  ["景怡鈞",  { carryOver: 35.3,   oldGrade: "進階兼職"   }],
  ["游宣綺",  { carryOver: 16.22,  oldGrade: "二級營業員" }],
  ["趙沛淋",  { carryOver: 98.05,  oldGrade: "進階兼職"   }],
  ["王舒儀",  { carryOver: 6.18,   oldGrade: "兼職新人"   }],
  ["伍沛婷",  { carryOver: 0,      oldGrade: "新進營業員" }],
  ["林偉婷",  { carryOver: 429.29, oldGrade: "二級營業員" }],
  ["吳雅婷",  { carryOver: 73.68,  oldGrade: "二級營業員" }],
  ["林嘉琪",  { carryOver: 300.94, oldGrade: "初階兼職"   }],
  ["程佳欣",  { carryOver: 158.37, oldGrade: "進階兼職"   }],
  ["張彤緁",  { carryOver: 71.55,  oldGrade: "三級營業員" }],
  ["邱璵",    { carryOver: 17.2,   oldGrade: "二級營業員" }],
  ["王楚翔",  { carryOver: 443.73, oldGrade: "新進營業員" }],
  ["王盈嵐",  { carryOver: 180.43, oldGrade: "三級營業員" }],
  ["簡子琳",  { carryOver: 9.25,   oldGrade: "三級營業員" }],
  ["胡雅琴",  { carryOver: 59.47,  oldGrade: "三級營業員" }],
  ["趙家賢",  { carryOver: 292.56, oldGrade: "一級營業員" }],
  ["蔡育昀",  { carryOver: 63.35,  oldGrade: "進階兼職"   }],
  ["羅莉薇",  { carryOver: 41.39,  oldGrade: "初階兼職"   }],
  ["鄭儀琳",  { carryOver: 23.21,  oldGrade: "二級營業員" }],
  ["范鈺庭",  { carryOver: 0,      oldGrade: "兼職新人"   }],
  ["孫芷昕",  { carryOver: 0,      oldGrade: "兼職新人"   }],
  ["張珈寧",  { carryOver: 87.97,  oldGrade: "三級營業員" }],
  ["石佳蓉",  { carryOver: 78.1,   oldGrade: "一級營業員" }],
  ["陳子萱",  { carryOver: 0,      oldGrade: "兼職新人"   }],
  ["陳梓欣",  { carryOver: 145.15, oldGrade: "二級營業員" }],
  ["徐怡欣",  { carryOver: 3.52,   oldGrade: "進階兼職"   }],
  ["江惠如",  { carryOver: 3.01,   oldGrade: "三級營業員" }],
  ["曾燕茹",  { carryOver: 73.48,  oldGrade: "初階兼職"   }],
  ["黃雅貞",  { carryOver: 24.68,  oldGrade: "新進營業員" }],
  ["蔡羽婷",  { carryOver: 89.75,  oldGrade: "兼職新人"   }],
  ["游淑涵",  { carryOver: 7.69,   oldGrade: "一級營業員" }],
  ["黃暐博",  { carryOver: 171.15, oldGrade: "兼職新人"   }],
  ["許晴媁",  { carryOver: 9.2,    oldGrade: "進階兼職"   }],
  ["周士傑",  { carryOver: 871.96, oldGrade: "兼職新人"   }],
  ["謝羽婷",  { carryOver: 0,      oldGrade: "新進營業員" }],
  ["王少筠",  { carryOver: 34.96,  oldGrade: "新進營業員" }],
  ["徐維志",  { carryOver: 167.65, oldGrade: "初階兼職"   }],
  ["鄧曉郁",  { carryOver: 0,      oldGrade: "新進營業員" }],
  ["阮宥緁",  { carryOver: 93.71,  oldGrade: "新進營業員" }],
]);

// 2026-08-17 在職名冊（全部 76 人）
// storeName = Store.name（不含「店」字，與 DB Store 表一致）
const ROSTER = [
  { name: "陳怡瑄",  currentGrade: "進階兼職",   storeName: "女中"  },
  { name: "游雅筑",  currentGrade: "二級營業員",  storeName: "女中"  },
  { name: "林郁映",  currentGrade: "一級營業員",  storeName: "女中"  },
  { name: "簡千蕙",  currentGrade: "進階兼職",   storeName: "女中"  },
  { name: "陳葦庭",  currentGrade: "副店長",     storeName: "女中"  },
  { name: "王珮慈",  currentGrade: "一級營業員",  storeName: "中正"  },
  { name: "林雅雯",  currentGrade: "三級店長",   storeName: "中正"  },
  { name: "巫思樺",  currentGrade: "三級營業員",  storeName: "中正"  },
  { name: "俞柔欣",  currentGrade: "兼職新人",   storeName: "中正"  },
  { name: "游婉婷",  currentGrade: "三級店長",   storeName: "中正南" },
  { name: "張郁",    currentGrade: "兼職新人",   storeName: "中正南" },
  { name: "曹家瑜",  currentGrade: "新進營業員",  storeName: "中正南" },
  { name: "林芳琪",  currentGrade: "兼職新人",   storeName: "中正南" },
  { name: "簡婉茹",  currentGrade: "二級店長",   storeName: "五結"  },
  { name: "陳韻晴",  currentGrade: "二級營業員",  storeName: "五結"  },
  { name: "戴綺",    currentGrade: "進階兼職",   storeName: "五結"  },
  { name: "李珮茹",  currentGrade: "新進營業員",  storeName: "五結"  },
  { name: "許翔嫃",  currentGrade: "兼職新人",   storeName: "五結"  },
  { name: "曾梅芳",  currentGrade: "二級店長",   storeName: "北成"  },
  { name: "廖祐君",  currentGrade: "二級營業員",  storeName: "北成"  },
  { name: "江環宇",  currentGrade: "副店長",     storeName: "北成"  },
  { name: "謝樂盈",  currentGrade: "初階兼職",   storeName: "北成"  },
  { name: "陳羿蓉",  currentGrade: "初階兼職",   storeName: "宜蘭"  },
  { name: "林奕甫",  currentGrade: "副店長",     storeName: "宜蘭"  },
  { name: "景怡鈞",  currentGrade: "二級營業員",  storeName: "宜蘭"  },
  { name: "鄭鈺潔",  currentGrade: "一級營業員",  storeName: "宜蘭"  },
  { name: "何芯瑩",  currentGrade: "新進營業員",  storeName: "宜蘭"  },
  { name: "陳念妤",  currentGrade: "二級店長",   storeName: "校舍"  },
  { name: "游宣綺",  currentGrade: "二級營業員",  storeName: "校舍"  },
  { name: "石育穎",  currentGrade: "兼職新人",   storeName: "校舍"  },
  { name: "關思婕",  currentGrade: "二級店長",   storeName: "馬賽"  },
  { name: "王舒儀",  currentGrade: "兼職新人",   storeName: "馬賽"  },
  { name: "伍沛婷",  currentGrade: "新進營業員",  storeName: "馬賽"  },
  { name: "林玟華",  currentGrade: "新進營業員",  storeName: "馬賽"  },
  { name: "陳憶慈",  currentGrade: "副店長",     storeName: "義成"  },
  { name: "林偉婷",  currentGrade: "二級營業員",  storeName: "義成"  },
  { name: "後瓊雯",  currentGrade: "三級店長",   storeName: "義成"  },
  { name: "吳雅婷",  currentGrade: "一級營業員",  storeName: "義成"  },
  { name: "張郁琳",  currentGrade: "兼職新人",   storeName: "義成"  },
  { name: "游勝淵",  currentGrade: "二級店長",   storeName: "礁溪"  },
  { name: "程佳欣",  currentGrade: "進階兼職",   storeName: "礁溪"  },
  { name: "林嘉琪",  currentGrade: "進階兼職",   storeName: "礁溪"  },
  { name: "蘇曉生",  currentGrade: "二級店長",   storeName: "力行"  },
  { name: "張彤緁",  currentGrade: "三級營業員",  storeName: "力行"  },
  { name: "邱璵",    currentGrade: "二級營業員",  storeName: "力行"  },
  { name: "王盈嵐",  currentGrade: "三級營業員",  storeName: "力行"  },
  { name: "張博雅",  currentGrade: "副店長",     storeName: "大有"  },
  { name: "黃雅貞",  currentGrade: "三級營業員",  storeName: "大有"  },
  { name: "王芊云",  currentGrade: "新進營業員",  storeName: "大有"  },
  { name: "游詩家",  currentGrade: "副店長",     storeName: "大竹"  },
  { name: "胡雅琴",  currentGrade: "三級營業員",  storeName: "大竹"  },
  { name: "廖怡玲",  currentGrade: "二級店長",   storeName: "中北"  },
  { name: "許晴媁",  currentGrade: "進階兼職",   storeName: "中北"  },
  { name: "張珈寧",  currentGrade: "二級營業員",  storeName: "中北"  },
  { name: "范鈺庭",  currentGrade: "兼職新人",   storeName: "中北"  },
  { name: "廖苡竹",  currentGrade: "二級店長",   storeName: "中埔"  },
  { name: "石佳蓉",  currentGrade: "一級營業員",  storeName: "中埔"  },
  { name: "陳子萱",  currentGrade: "兼職新人",   storeName: "中埔"  },
  { name: "邱競瑩",  currentGrade: "新進營業員",  storeName: "中埔"  },
  { name: "游佩菁",  currentGrade: "新進營業員",  storeName: "中埔"  },
  { name: "江惠如",  currentGrade: "三級營業員",  storeName: "五福"  },
  { name: "李玉如",  currentGrade: "二級店長",   storeName: "五福"  },
  { name: "徐怡欣",  currentGrade: "進階兼職",   storeName: "五福"  },
  { name: "游淑涵",  currentGrade: "副店長",     storeName: "五福"  },
  { name: "何雅芬",  currentGrade: "新進營業員",  storeName: "五福"  },
  { name: "黃暐博",  currentGrade: "兼職新人",   storeName: "內壢"  },
  { name: "趙家賢",  currentGrade: "一級營業員",  storeName: "內壢"  },
  { name: "鄭儀琳",  currentGrade: "二級營業員",  storeName: "昆明"  },
  { name: "吳怡樺",  currentGrade: "二級店長",   storeName: "昆明"  },
  { name: "李芸溱",  currentGrade: "一級店長",   storeName: "東勇"  },
  { name: "周士傑",  currentGrade: "兼職新人",   storeName: "東勇"  },
  { name: "謝羽婷",  currentGrade: "新進營業員",  storeName: "東勇"  },
  { name: "曾寶方",  currentGrade: "副店長",     storeName: "南竹"  },
  { name: "黃靖雅",  currentGrade: "一級店長",   storeName: "南竹"  },
  { name: "徐維志",  currentGrade: "初階兼職",   storeName: "南竹"  },
  { name: "王少筠",  currentGrade: "新進營業員",  storeName: "南竹"  },
];

const CARRY_OVER_DATE = new Date("2026-02-28");

export async function POST() {
  const rosterNames = ROSTER.map((r) => r.name);
  const placeholders = rosterNames.map((_, i) => `$${i + 1}`).join(",");
  const employees = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT e.id, e.name FROM "Employee" e
     WHERE e."leaveDate" IS NULL AND e.name IN (${placeholders})`,
    ...rosterNames
  );

  const empMap = new Map(employees.map((e) => [e.name, e.id]));

  // 查詢所有需要的門市 ID
  const storeNames = [...new Set(ROSTER.map((r) => r.storeName))];
  const storePlaceholders = storeNames.map((_, i) => `$${i + 1}`).join(",");
  const stores = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT id, name FROM "Store" WHERE name IN (${storePlaceholders})`,
    ...storeNames
  );
  const storeMap = new Map(stores.map((s) => [s.name, s.id]));

  const results: string[] = [];
  let inserted = 0;
  const notFound: string[] = [];

  for (const { name, currentGrade, storeName } of ROSTER) {
    const empId = empMap.get(name);
    if (!empId) {
      notFound.push(name);
      continue;
    }

    const carry = CARRY_OVER_MAP.get(name);
    let hoursCarryOver: number;
    let note: string | null = null;

    if (!carry) {
      hoursCarryOver = 0;
      note = "2026-02 前無跨店記錄，carryOver 從 0 開始";
    } else if (currentGrade === carry.oldGrade) {
      hoursCarryOver = Math.max(0, carry.carryOver);
    } else {
      // 職等已升遷：扣掉舊職等門檻後的剩餘時數
      const prevHours = GRADE_CROSS_HOURS[carry.oldGrade] ?? 0;
      hoursCarryOver = Math.max(0, carry.carryOver - prevHours);
      note = `升職：${carry.oldGrade}→${currentGrade}；AS=${carry.carryOver}，扣${prevHours}h後carryOver=${hoursCarryOver.toFixed(2)}`;
    }

    const targetGrade = GRADE_NEXT[currentGrade] ?? null;
    const hoursRequired = GRADE_CROSS_HOURS[currentGrade] ?? null;
    const homeStoreId = storeMap.get(storeName) ?? null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeePromotionTracking"
        (id, "employeeId", "currentGrade", "targetGrade", "hoursRequired", "hoursCarryOver", "carryOverDate", "homeStoreId", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ("employeeId") DO UPDATE SET
         "currentGrade"   = EXCLUDED."currentGrade",
         "targetGrade"    = EXCLUDED."targetGrade",
         "hoursRequired"  = EXCLUDED."hoursRequired",
         "hoursCarryOver" = EXCLUDED."hoursCarryOver",
         "carryOverDate"  = EXCLUDED."carryOverDate",
         "homeStoreId"    = EXCLUDED."homeStoreId",
         note             = EXCLUDED.note,
         "updatedAt"      = CURRENT_TIMESTAMP`,
      createId(), empId, currentGrade, targetGrade,
      hoursRequired, hoursCarryOver, CARRY_OVER_DATE, homeStoreId, note,
    );
    inserted++;
    results.push(
      `${name}（${storeName}）：${currentGrade}${targetGrade ? `→${targetGrade}` : "（無門檻）"}，carryOver=${hoursCarryOver.toFixed(1)}h${homeStoreId ? "" : " [門市未找到]"}${note ? ` [${note}]` : ""}`
    );
  }

  return NextResponse.json({ ok: true, inserted, notFound, detail: results });
}
