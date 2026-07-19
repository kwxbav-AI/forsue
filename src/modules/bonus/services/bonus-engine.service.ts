import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { parseDateOnlyUTC, businessDayWorkDateFromDate } from "@/lib/date";

// ─── 常數 ──────────────────────────────────────────────────────────────────────
const BASE_BONUS = 168;
const EXCEED_BONUS = 336;
const EXCEED_THRESHOLD = 6000;
const OPS_BONUS_PER_PERSON = 72;
const FULL_HOURS = 8;
const MONTHLY_GUARANTEE = new Decimal(2640);
const DAILY_GUARANTEE = new Decimal(120);

const DEFAULT_MULTIPLIERS: Record<string, number> = {
  進階兼職: 1.4,
  初階兼職: 1.2,
  兼職新人: 1,
  一級營業員: 1.6,
  二級營業員: 1.4,
  三級營業員: 1.2,
  新進營業員: 1,
  一級店長: 1.8,
  二級店長: 1.7,
  三級店長: 1.7,
  副店長: 1.6,
  兼職人員: 1,
  專員: 1,
  "兼職-寒假短期工讀": 0,
  臨時理貨人員: 1,
  "兼職-暑假短期工讀": 0,
  蔬果處理人員: 1,
};

// ─── 工時計算規則 (Rule 7) ─────────────────────────────────────────────────────
function calcBonusHours(actualHours: number, scheduledHours: number): number {
  const effective = actualHours + 0.1 > 8 ? 8 : actualHours;
  return Math.min(effective, scheduledHours);
}

// ─── 新人比例 (Rule 2)：以到職日起算的實際天數判斷（0-29天50%、30-59天80%），
// 不是用日曆月份差，避免月中到職者在月份切換當天就被提早跳級 ──────────────────
function newHireRatio(hireDate: Date | null, workDate: Date): number {
  if (!hireDate) return 1;
  const daysSinceHire = Math.floor(
    (workDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceHire < 30) return 0.5;
  if (daysSinceHire < 60) return 0.8;
  return 1;
}

// ─── 營運成果獎金池排除名單（短期工讀 + A/B/C/D/E 開頭員編）───────────────────────
const OPS_POOL_EXCLUDED_POSITIONS = new Set(["兼職-暑假短期工讀", "兼職-寒假短期工讀"]);
function isExcludedFromOpsPool(emp: { employeeCode: string; position: string | null } | undefined): boolean {
  if (!emp) return true;
  if (/^[ABCDEabcde]/.test(emp.employeeCode)) return true;
  if (emp.position && OPS_POOL_EXCLUDED_POSITIONS.has(emp.position)) return true;
  return false;
}

// ─── 是否為兼職 ────────────────────────────────────────────────────────────────
function isPartTime(shiftType: string | null | undefined, scheduledHours: number): boolean {
  if (shiftType?.startsWith("FT-")) return false;
  if (shiftType?.startsWith("PT-")) return true;
  return scheduledHours < FULL_HOURS;
}

// ─── 主要輸出型別 ──────────────────────────────────────────────────────────────
export interface BonusDailyDetail {
  workDate: string;
  weekday: number;
  storeId: string;
  storeName: string;
  isTargetMet: boolean;
  isExceeded: boolean;
  efficiencyRatio: number;
  scheduledHours: number;
  actualWorkHours: number;
  calcHours: number;
  baseBonus: number;
  dailyBonus: number;
  dispatchNote: string | null;
  countsTowardHours: boolean;
}

export interface BonusEmployeeResult {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  storeName: string;
  position: string | null;
  totalCalcHours: number;
  targetBonus: number;
  operationsBonus: number;
  subtotalBonus: number;
  newHireRatio: number;
  isNewStoreGuarantee: boolean;
  guaranteeAmount: number | null;
  bonusMultiplier: number;
  accountabilityRatio: number;
  finalBonus: number;
  dailyDetails: BonusDailyDetail[];
}

// ─── 主計算函式 ────────────────────────────────────────────────────────────────
export async function calculateMonthlyBonus(yearMonth: string): Promise<BonusEmployeeResult[]> {
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = parseDateOnlyUTC(`${yearMonth}-01`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = parseDateOnlyUTC(`${yearMonth}-${String(lastDay).padStart(2, "0")}`);

  // 取得所有資料
  const [attendances, dispatches, performanceDailies, employees, newStoreSettings, multiplierRows, existingResults, allStores] =
    await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { workDate: { gte: startDate, lte: endDate } },
        include: { employee: true },
        orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
      }),
      prisma.dispatchRecord.findMany({
        where: { workDate: { gte: startDate, lte: endDate } },
      }),
      prisma.performanceDaily.findMany({
        where: { workDate: { gte: startDate, lte: endDate } },
        include: { store: { select: { id: true, name: true } } },
      }),
      prisma.employee.findMany({
        where: { isActive: true },
        include: { defaultStore: { select: { name: true } } },
      }),
      prisma.newStoreSetting.findMany({ include: { store: { select: { id: true, name: true } } } }),
      prisma.bonusMultiplier.findMany(),
      prisma.monthlyBonusResult.findMany({
        where: { yearMonth },
        select: { employeeId: true, accountabilityRatio: true },
      }),
      prisma.store.findMany({ select: { id: true, hideInReports: true, excludeFromBonus: true } }),
    ]);

  // 建立查找索引
  const multiplierMap = new Map<string, number>(
    multiplierRows.map((r: { position: string; multiplier: unknown }) => [r.position, Number(r.multiplier)])
  );
  const getMultiplier = (position: string | null) =>
    position ? (multiplierMap.get(position) ?? DEFAULT_MULTIPLIERS[position] ?? 1) : 1;

  const accountabilityMap = new Map<string, number>(
    existingResults.map((r: { employeeId: string; accountabilityRatio: unknown }) => [r.employeeId, Number(r.accountabilityRatio)])
  );

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // 報表隱藏門市（後勤/非門市部門）：這些門市的員工不計算達標獎金
  const hiddenStoreIds = new Set<string>(allStores.filter((s) => s.hideInReports).map((s) => s.id));

  // 排除獎金計算的門市（例如台北區）：不計入營運成果獎金池，也不貢獻池子金額
  // 獨立於 hideInReports（報表隱藏），門市管理頁面「排除獎金計算」勾選設定
  const opsPoolExcludedStoreIds = new Set<string>(
    allStores.filter((s) => s.excludeFromBonus).map((s) => s.id)
  );

  // 新店查找：storeId → 是否在本月保障期內
  const newStoreIds = new Set<string>();
  for (const ns of newStoreSettings) {
    const openDate = ns.openDate;
    const guaranteeEndDate = new Date(openDate);
    guaranteeEndDate.setUTCMonth(guaranteeEndDate.getUTCMonth() + ns.guaranteeMonths);
    if (startDate <= guaranteeEndDate && endDate >= openDate) {
      newStoreIds.add(ns.storeId);
    }
  }

  // PerformanceDaily 按日期+門市索引
  const perfMap = new Map<string, (typeof performanceDailies)[number]>();
  for (const p of performanceDailies) {
    perfMap.set(`${p.workDate.toISOString().slice(0, 10)}_${p.storeId}`, p);
  }

  // 出勤按日期+員工索引（每日可能多筆）
  const attByDateEmployee = new Map<string, (typeof attendances)[number][]>();
  for (const a of attendances) {
    const key = `${a.workDate.toISOString().slice(0, 10)}_${a.employeeId}`;
    const list = attByDateEmployee.get(key) ?? [];
    list.push(a);
    attByDateEmployee.set(key, list);
  }

  // 調度按日期+員工索引
  const dispByDateEmployee = new Map<string, (typeof dispatches)[number][]>();
  for (const d of dispatches) {
    const key = `${d.workDate.toISOString().slice(0, 10)}_${d.employeeId}`;
    const list = dispByDateEmployee.get(key) ?? [];
    list.push(d);
    dispByDateEmployee.set(key, list);
  }

  // ─── 逐日計算 ────────────────────────────────────────────────────────────────
  // dailyBonusByEmployee[employeeId][dateStr] = BonusDailyDetail
  const dailyBonusByEmployee = new Map<string, Map<string, BonusDailyDetail>>();
  // 每日個人計算工時（用於分配營運成果獎金池）
  const dailyCalcHoursByEmployee = new Map<string, Map<string, number>>();
  // 每日營運成果獎金池
  const dailyOpsPool = new Map<string, number>(); // dateStr → pool amount

  // 遍歷每一天
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const dateStr = cur.toISOString().slice(0, 10);
    const weekday = cur.getUTCDay(); // 0=Sun, 1-5=Mon-Fri, 6=Sat
    const exactDate = businessDayWorkDateFromDate(cur);

    // 取得今天所有有出勤的員工
    const todayAttendees = new Set<string>();
    for (const a of attendances) {
      if (a.workDate.toISOString().slice(0, 10) === dateStr) {
        todayAttendees.add(a.employeeId);
      }
    }

    // 計算今日每個員工的計算工時（用於池子分配）
    const dailyCalcHoursMap = new Map<string, number>();

    // 計算每個員工當日達標獎金
    for (const employeeId of todayAttendees) {
      const attList = attByDateEmployee.get(`${dateStr}_${employeeId}`) ?? [];
      if (attList.length === 0) continue;

      // 累加實際工時（多筆出勤）
      const totalActual = attList.reduce((sum, a) => sum + Number(a.workHours), 0);
      const scheduledHours = attList[0].scheduledWorkHours
        ? Number(attList[0].scheduledWorkHours)
        : FULL_HOURS;
      const originalStoreId = attList[0].originalStoreId;
      const empNhRatio = newHireRatio(employeeMap.get(employeeId)?.hireDate ?? null, cur);

      // 判斷門市達標狀態
      const dispList = dispByDateEmployee.get(`${dateStr}_${employeeId}`) ?? [];
      const hasDispatch = dispList.length > 0;
      // 不看調度事由文字（用詞容易不一致，例如「人力支援」vs「後勤支援門市」），
      // 只看這個人的原門市是不是後勤/報表隱藏門市：是的話，被調度出去支援時
      // 一律用調度時數算比例，不用整天出勤工時
      const homeStoreId = originalStoreId ?? (employeeMap.get(employeeId)?.defaultStoreId ?? "");
      const isBackofficeSupport = hasDispatch && hiddenStoreIds.has(homeStoreId);
      // 獎金池相關判斷（後勤/報表隱藏、排除獎金計算門市）一律用「調度後實際支援店」，
      // 不要用 storeId（storeId 只有達標當天才會換成支援店，沒達標時仍是原門市，
      // 會誤把沒達標的支援日當成後勤自己的門市而整天被排除）
      const poolStoreId = hasDispatch ? (dispList[0].toStoreId ?? homeStoreId) : homeStoreId;

      // 後勤支援門市：獎金比例用「調度時數」而非整天出勤工時（支援店只算實際支援的時間）
      const hoursForBonusRatio = isBackofficeSupport
        ? Number(dispList[0].actualHours ?? dispList[0].dispatchHours ?? 0)
        : totalActual;
      const calcH = calcBonusHours(hoursForBonusRatio, scheduledHours);

      let storeId = originalStoreId ?? (employeeMap.get(employeeId)?.defaultStoreId ?? "");
      let storeName = "";
      let isTargetMet = false;
      let isExceeded = false;
      let effRatio = 0;
      let dispatchNote: string | null = null;
      let baseBonus = 0;

      if (!hasDispatch) {
        // 無調度：直接看原門市績效（後勤/報表隱藏門市不計算達標獎金）
        const perf = perfMap.get(`${dateStr}_${storeId}`);
        if (perf && !hiddenStoreIds.has(storeId)) {
          storeName = perf.store.name;
          effRatio = Number(perf.efficiencyRatio);
          isTargetMet = perf.isTargetMet;
          isExceeded = weekday >= 1 && weekday <= 5 && effRatio >= EXCEED_THRESHOLD;
        } else if (perf) {
          storeName = perf.store.name;
        }
      } else {
        // 有調度：檢查原店及支援店
        const disp = dispList[0];
        const isXType = (disp.remark ?? "").includes("(X)");
        const fromStoreId = disp.fromStoreId ?? storeId;
        const toStoreId = disp.toStoreId;

        const fromPerf = perfMap.get(`${dateStr}_${fromStoreId}`);
        const toPerf = perfMap.get(`${dateStr}_${toStoreId}`);

        const fromMet = fromPerf?.isTargetMet ?? false;
        const toMet = toPerf?.isTargetMet ?? false;
        const fromExceeded =
          weekday >= 1 && weekday <= 5 && Number(fromPerf?.efficiencyRatio ?? 0) >= EXCEED_THRESHOLD;
        const toExceeded =
          weekday >= 1 && weekday <= 5 && Number(toPerf?.efficiencyRatio ?? 0) >= EXCEED_THRESHOLD;

        const anyMet = fromMet || toMet;
        isTargetMet = anyMet;

        if (anyMet) {
          if (isXType) {
            // 取兩店較高的獎金（超標 > 達標，皆未達則 0）
            const fromBonus = fromMet ? (fromExceeded ? EXCEED_BONUS : BASE_BONUS) : 0;
            const toBonus = toMet ? (toExceeded ? EXCEED_BONUS : BASE_BONUS) : 0;
            baseBonus = Math.max(fromBonus, toBonus);
            isExceeded = baseBonus === EXCEED_BONUS;
            dispatchNote = "調店(X)";
          } else {
            // 正常調度：1.5倍
            const anyExceeded = fromExceeded || toExceeded;
            isExceeded = anyExceeded;
            baseBonus = anyExceeded ? EXCEED_BONUS : BASE_BONUS;
            dispatchNote = "調店×1.5";
          }
          // 使用到店的門市資訊顯示
          storeId = toStoreId;
        }

        if (toPerf) {
          storeName = toPerf.store.name;
          effRatio = Number(toPerf.efficiencyRatio);
        } else if (fromPerf) {
          storeName = fromPerf.store.name;
          effRatio = Number(fromPerf.efficiencyRatio);
        }
      }

      // 後勤/報表隱藏門市，當天沒有調度支援 → 這天工時跟任何獎金計算都無關
      // （不是「未達標領 0」，是根本不算），計算工時彙總要排除，避免顯示誤導
      const countsTowardHours = !hiddenStoreIds.has(poolStoreId) || hasDispatch;

      if (!isTargetMet || calcH === 0) {
        // 未達標或無工時 → 0 獎金，但仍記錄
        const detail: BonusDailyDetail = {
          workDate: dateStr,
          weekday,
          storeId,
          storeName,
          isTargetMet: false,
          isExceeded: false,
          efficiencyRatio: effRatio,
          scheduledHours,
          actualWorkHours: totalActual,
          calcHours: calcH,
          baseBonus: 0,
          dailyBonus: 0,
          dispatchNote,
          countsTowardHours,
        };
        if (!dailyBonusByEmployee.has(employeeId)) dailyBonusByEmployee.set(employeeId, new Map());
        dailyBonusByEmployee.get(employeeId)!.set(dateStr, detail);
        // 後勤門市員工（未調度）、短期工讀、A/B/C 開頭員編、台北區不參與 ops 池
        if (
          countsTowardHours &&
          !isExcludedFromOpsPool(employeeMap.get(employeeId)) &&
          !opsPoolExcludedStoreIds.has(poolStoreId)
        ) {
          dailyCalcHoursMap.set(employeeId, calcH);
        }
        continue;
      }

      // 計算當日比例
      let ratio: number;
      if (weekday === 6) {
        // 六：>=3h → 100%, <3h → 50%
        ratio = calcH >= 3 ? 1 : 0.5;
      } else {
        // 平日：一律按 8h 比例（計算工時已依 Rule 7 上限為排班時數，
        // 兼職排班較短者，比例自然按排班時數/8 打折，不會跟正職領一樣多）
        ratio = Math.min(calcH / FULL_HOURS, 1);
      }

      if (!baseBonus) {
        baseBonus = isExceeded ? EXCEED_BONUS : BASE_BONUS;
      }

      let dailyBonus = new Decimal(baseBonus).mul(ratio);
      // 調度1.5倍
      if (dispatchNote === "調店×1.5") {
        dailyBonus = dailyBonus.mul(1.5);
      }
      // 新人比例：逐日套用，避免月中到職／跨月時整月只套一次比例造成的偏差
      dailyBonus = dailyBonus.mul(empNhRatio);

      const detail: BonusDailyDetail = {
        workDate: dateStr,
        weekday,
        storeId,
        storeName,
        isTargetMet,
        isExceeded,
        efficiencyRatio: effRatio,
        scheduledHours,
        actualWorkHours: totalActual,
        calcHours: calcH,
        baseBonus,
        dailyBonus: dailyBonus.toDecimalPlaces(2).toNumber(),
        dispatchNote,
        countsTowardHours,
      };
      if (!dailyBonusByEmployee.has(employeeId)) dailyBonusByEmployee.set(employeeId, new Map());
      dailyBonusByEmployee.get(employeeId)!.set(dateStr, detail);

      // 計入 ops 池工時：後勤門市員工（未調度）、短期工讀、A/B/C 開頭員編、台北區不參與池子分配
      if (
        countsTowardHours &&
        !isExcludedFromOpsPool(employeeMap.get(employeeId)) &&
        !opsPoolExcludedStoreIds.has(poolStoreId)
      ) {
        dailyCalcHoursMap.set(employeeId, calcH);
      }
    }

    // 計算今日營運成果獎金池
    // 池子 = 72 × 上班人數，超標門市加倍（144）；人數採「調度後實際上班門市」
    const storeTargetInfo = new Map<string, { isTargetMet: boolean; isExceeded: boolean }>();
    for (const p of performanceDailies) {
      if (p.workDate.toISOString().slice(0, 10) !== dateStr) continue;
      if (opsPoolExcludedStoreIds.has(p.storeId)) continue; // 台北區門市不貢獻獎金池
      const isExceeded =
        weekday >= 1 && weekday <= 5 && Number(p.efficiencyRatio) >= EXCEED_THRESHOLD;
      storeTargetInfo.set(p.storeId, { isTargetMet: p.isTargetMet, isExceeded });
    }

    const poolHeadcountByStore = new Map<string, number>();
    for (const employeeId of todayAttendees) {
      const attList = attByDateEmployee.get(`${dateStr}_${employeeId}`) ?? [];
      // 請假等 0 工時的出勤紀錄不算「有上班」，不計入池子人數
      const totalActual = attList.reduce((sum, a) => sum + Number(a.workHours), 0);
      if (totalActual <= 0) continue;
      // 短期工讀、A/B/C 開頭員編不計入池子人數
      if (isExcludedFromOpsPool(employeeMap.get(employeeId))) continue;

      const origStoreId = attList[0]?.originalStoreId ?? "";
      const empDispList = dispByDateEmployee.get(`${dateStr}_${employeeId}`) ?? [];
      // 調撥後的實際上班門市：有調度就算支援店，沒有才算原門市
      const actualStoreId =
        empDispList.length > 0 ? (empDispList[0].toStoreId ?? origStoreId) : origStoreId;

      poolHeadcountByStore.set(actualStoreId, (poolHeadcountByStore.get(actualStoreId) ?? 0) + 1);
    }

    let dailyPoolTotal = 0;
    poolHeadcountByStore.forEach((headcount, storeId) => {
      const info = storeTargetInfo.get(storeId);
      if (!info?.isTargetMet) return;
      const multiplier = info.isExceeded ? 2 : 1;
      dailyPoolTotal += OPS_BONUS_PER_PERSON * multiplier * headcount;
    });
    dailyOpsPool.set(dateStr, dailyPoolTotal);

    // 記錄計算工時
    const dailyCalcEntry = new Map<string, number>();
    dailyCalcHoursMap.forEach((h, eid) => dailyCalcEntry.set(eid, h));
    dailyCalcHoursByEmployee.set(dateStr, dailyCalcEntry);

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // ─── 計算營運成果獎金分配（整月獎金池，按整月總工時比例一次分配） ────────────────
  const totalOpsBonus = new Map<string, number>(); // employeeId → 月份營運成果獎金

  let totalMonthlyPool = 0;
  dailyOpsPool.forEach((pool) => {
    totalMonthlyPool += pool;
  });

  const employeeMonthlyHours = new Map<string, number>();
  let totalMonthlyHoursAllEmployees = 0;
  dailyCalcHoursByEmployee.forEach((calcMap) => {
    calcMap.forEach((h, eid) => {
      employeeMonthlyHours.set(eid, (employeeMonthlyHours.get(eid) ?? 0) + h);
      totalMonthlyHoursAllEmployees += h;
    });
  });

  if (totalMonthlyPool > 0 && totalMonthlyHoursAllEmployees > 0) {
    employeeMonthlyHours.forEach((h, eid) => {
      const share = new Decimal(totalMonthlyPool)
        .mul(h)
        .div(totalMonthlyHoursAllEmployees)
        .toDecimalPlaces(2)
        .toNumber();
      totalOpsBonus.set(eid, share);
    });
  }

  // ─── 彙總每人結果 ─────────────────────────────────────────────────────────────
  const results: BonusEmployeeResult[] = [];

  // 取得所有有出勤記錄的員工
  const allEmployeeIds = new Set<string>();
  for (const a of attendances) allEmployeeIds.add(a.employeeId);

  for (const employeeId of allEmployeeIds) {
    const emp = employeeMap.get(employeeId);
    if (!emp) continue;
    // A/B/C 開頭：後台管理人員；D/E 開頭：臨時人員 — 皆不計算獎金
    if (/^[ABCDEabcde]/.test(emp.employeeCode)) continue;

    const dailyMap = dailyBonusByEmployee.get(employeeId) ?? new Map<string, BonusDailyDetail>();
    const details = Array.from(dailyMap.values()).sort((a, b) => a.workDate.localeCompare(b.workDate));

    // 顯示的計算工時直接用「實際餵進獎金池分配公式」的工時，跟 operationsBonus 用同一份數字，
    // 避免顯示欄位跟實際分配各自算一次、彼此漂移
    const totalCalcHours = employeeMonthlyHours.get(employeeId) ?? 0;
    // 新人比例已於逐日計算 dailyBonus 時套用（見上方迴圈），此處加總即為套用後金額
    const targetBonus = details.reduce((s, d) => s + d.dailyBonus, 0);
    const operationsBonus = totalOpsBonus.get(employeeId) ?? 0;

    // 新人比例：僅用於顯示（新人%欄位）與新店保障金額計算，實際達標獎金已逐日套用
    // 取月底當天的比例作為整月代表值
    const nhRatio = newHireRatio(emp.hireDate, endDate);
    let subtotalBonus = new Decimal(targetBonus).add(operationsBonus);

    // 新店保障：優先用 defaultStoreId，若為 null 則從出勤記錄推算最常出現的門市
    let homeStoreId = emp.defaultStoreId ?? "";
    if (!homeStoreId) {
      const storeIdCounts = new Map<string, number>();
      for (const a of attendances) {
        if (a.employeeId === employeeId && a.originalStoreId) {
          storeIdCounts.set(a.originalStoreId, (storeIdCounts.get(a.originalStoreId) ?? 0) + 1);
        }
      }
      homeStoreId = Array.from(storeIdCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }

    // 主力門市為後勤（hideInReports）且完全沒有達標獎金（從未調度到正式門市）→ 跳過
    if (hiddenStoreIds.has(homeStoreId) && targetBonus === 0) continue;

    const isNewStore = newStoreIds.has(homeStoreId);
    let guaranteeAmount: Decimal | null = null;
    let isNewStoreGuarantee = false;

    if (isNewStore) {
      // 計算該員工的保障金額（按兼職比例 = 表訂工時/8，一律套用，不分全兼職）
      // 公式：實際出勤天數 * 120 * nhRatio * (表訂工時/8)，扣除請假天不給保障
      const allDetails = details.filter((d) => d.calcHours > 0);
      let representativeScheduled = FULL_HOURS;
      if (allDetails.length > 0) {
        const counts = new Map<number, number>();
        for (const d of allDetails) counts.set(d.scheduledHours, (counts.get(d.scheduledHours) ?? 0) + 1);
        representativeScheduled = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      const guarantee = DAILY_GUARANTEE.mul(allDetails.length).mul(representativeScheduled).div(FULL_HOURS).mul(nhRatio);
      if (subtotalBonus.lessThan(guarantee)) {
        subtotalBonus = guarantee;
        guaranteeAmount = guarantee;
        isNewStoreGuarantee = true;
      }
    }

    const multiplier = getMultiplier(emp.position);
    const accountability = accountabilityMap.get(employeeId) ?? 1;
    const finalBonus = subtotalBonus.mul(multiplier).mul(accountability).toDecimalPlaces(0).toNumber();

    // 主要門市名稱（從詳細記錄取最常出現的）
    const storeNameCounts = new Map<string, number>();
    for (const d of details) {
      storeNameCounts.set(d.storeName, (storeNameCounts.get(d.storeName) ?? 0) + 1);
    }
    const storeName =
      Array.from(storeNameCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      emp.defaultStore?.name ?? "";

    results.push({
      employeeId,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      storeName,
      position: emp.position,
      totalCalcHours: new Decimal(totalCalcHours).toDecimalPlaces(2).toNumber(),
      targetBonus: new Decimal(targetBonus).toDecimalPlaces(2).toNumber(),
      operationsBonus: new Decimal(operationsBonus).toDecimalPlaces(2).toNumber(),
      subtotalBonus: subtotalBonus.toDecimalPlaces(2).toNumber(),
      newHireRatio: nhRatio,
      isNewStoreGuarantee,
      guaranteeAmount: guaranteeAmount?.toDecimalPlaces(2).toNumber() ?? null,
      bonusMultiplier: multiplier,
      accountabilityRatio: accountability,
      finalBonus,
      dailyDetails: details,
    });
  }

  return results.sort((a, b) => a.storeName.localeCompare(b.storeName) || a.employeeName.localeCompare(b.employeeName));
}

// ─── 儲存計算結果 ──────────────────────────────────────────────────────────────
export async function saveMonthlyBonusResults(
  yearMonth: string,
  results: BonusEmployeeResult[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 保留既有的權責比例設定
    const existing = await tx.monthlyBonusResult.findMany({
      where: { yearMonth },
      select: { employeeId: true, accountabilityRatio: true },
    });
    const savedAccountability = new Map(existing.map((r: { employeeId: string; accountabilityRatio: unknown }) => [r.employeeId, r.accountabilityRatio]));

    // 刪除舊結果（含明細）
    await tx.monthlyBonusDailyDetail.deleteMany({
      where: { bonusResult: { yearMonth } },
    });
    await tx.monthlyBonusResult.deleteMany({ where: { yearMonth } });

    // 批次寫入新結果
    for (const r of results) {
      const savedAccountabilityRatio = savedAccountability.get(r.employeeId);
      const accountabilityRatio = savedAccountabilityRatio
        ? Number(savedAccountabilityRatio)
        : r.accountabilityRatio;
      // 若權責比例已被修改，重算最終獎金
      const finalBonus =
        accountabilityRatio !== r.accountabilityRatio
          ? new Decimal(r.subtotalBonus).mul(r.bonusMultiplier).mul(accountabilityRatio).toDecimalPlaces(0).toNumber()
          : r.finalBonus;

      const created = await tx.monthlyBonusResult.create({
        data: {
          yearMonth,
          employeeId: r.employeeId,
          employeeCode: r.employeeCode,
          employeeName: r.employeeName,
          storeName: r.storeName,
          position: r.position,
          totalCalcHours: r.totalCalcHours,
          targetBonus: r.targetBonus,
          operationsBonus: r.operationsBonus,
          subtotalBonus: r.subtotalBonus,
          newHireRatio: r.newHireRatio,
          isNewStoreGuarantee: r.isNewStoreGuarantee,
          guaranteeAmount: r.guaranteeAmount,
          bonusMultiplier: r.bonusMultiplier,
          accountabilityRatio,
          finalBonus,
        },
      });

      // 寫入每日明細
      if (r.dailyDetails.length > 0) {
        await tx.monthlyBonusDailyDetail.createMany({
          data: r.dailyDetails.map((d) => ({
            bonusResultId: created.id,
            workDate: parseDateOnlyUTC(d.workDate),
            weekday: d.weekday,
            storeId: d.storeId,
            storeName: d.storeName,
            isTargetMet: d.isTargetMet,
            isExceeded: d.isExceeded,
            efficiencyRatio: d.efficiencyRatio,
            scheduledHours: d.scheduledHours,
            actualWorkHours: d.actualWorkHours,
            calcHours: d.calcHours,
            baseBonus: d.baseBonus,
            dailyBonus: d.dailyBonus,
            dispatchNote: d.dispatchNote,
          })),
        });
      }
    }
  });
}
