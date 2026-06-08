import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { computeRplhTarget } from "@/lib/operations";
import {
  monthStartEndYmd,
  splitWeekdaySaturdayWorkingDaysInRangeUTC,
} from "@/lib/month-working-calendar";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { normalizeStoreKey } from "@/lib/operations-dashboard";
import { ensureRetailStoresFromPerformance } from "@/modules/operations/services/retail-store-sync.service";
import { resolveRetailStore } from "@/modules/operations/services/retail-store-match.service";

const MONTH_HEADER_RE = /^(\d{4})-(\d{2})$/;

/** H 欄（0-based 7）週一～五每日工時；I 欄（0-based 8）週六工時 */
const WEEKDAY_LABOR_COL = 7;
const SATURDAY_LABOR_COL = 8;
const TARGET_RPLH_COL = 3;
const NOTE_COL = 4;
const REGION_COL = 0;
const STORE_COL = 1;

type StoreLaborProfile = {
  weekdayDailyHours: number;
  saturdayDailyHours: number;
};

export type StoreTargetImportResult = {
  year: number;
  upserted: number;
  skipped: number;
  matchedStores: number;
  unmatchedStores: string[];
  warnings: string[];
};

type MonthValues = Map<number, number>;

type ParsedStoreRow = {
  region: string;
  storeLabel: string;
  storeKey: string;
  months: MonthValues;
  note?: string;
};

type ParsedHeadcountRow = {
  region: string;
  storeLabel: string;
  storeKey: string;
  weekdayDailyHours: number;
  saturdayDailyHours: number;
  targetRplh: number;
  note?: string;
};

function parseNumericCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isSkippableRow(storeLabel: unknown): boolean {
  const s = String(storeLabel ?? "").trim();
  if (!s) return true;
  return /合計|小計|總計|備註說明/.test(s);
}

async function loadHolidayYmdSet(year: number): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: {
        gte: parseDateOnlyUTC(`${year}-01-01`),
        lte: parseDateOnlyUTC(`${year}-12-31`),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => formatDateOnly(h.date)));
}

function normalizeHeaderLabel(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function resolveLaborColumns(header: string[]): {
  weekdayCol: number;
  saturdayCol: number;
} {
  let weekdayCol = -1;
  let saturdayCol = -1;
  header.forEach((raw, col) => {
    const h = normalizeHeaderLabel(raw);
    if (!h) return;
    if (h.includes("週六") && (h.includes("工時") || h.includes("預估"))) {
      saturdayCol = col;
      return;
    }
    if (
      (h.includes("週一") || h.includes("週五") || h.includes("平日")) &&
      (h.includes("工時") || h.includes("預估"))
    ) {
      weekdayCol = col;
    }
  });
  if (weekdayCol < 0) {
    weekdayCol = header.findIndex((raw) => {
      const h = normalizeHeaderLabel(raw);
      return h.includes("預估工時") && !h.includes("週六");
    });
  }
  return {
    weekdayCol: weekdayCol >= 0 ? weekdayCol : WEEKDAY_LABOR_COL,
    saturdayCol: saturdayCol >= 0 ? saturdayCol : SATURDAY_LABOR_COL,
  };
}

function findHeadcountHeaderRow(rows: unknown[][]): {
  headerRow: number;
  weekdayCol: number;
  saturdayCol: number;
  rplhCol: number;
  noteCol: number;
} {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const header = (rows[i] ?? []).map((c) => String(c ?? "").trim());
    const { weekdayCol, saturdayCol } = resolveLaborColumns(header);
    const hasLaborHeader = header.some((raw) => {
      const h = normalizeHeaderLabel(raw);
      return h.includes("預估工時") || h.includes("週六");
    });
    if (hasLaborHeader) {
      const rplhCol = header.findIndex(
        (h) => h.includes("目標人效") || h === "目標人效（可調整）"
      );
      const noteCol = header.findIndex((h) => h.includes("人效設定") || h === "人效設定說明");
      return {
        headerRow: i,
        weekdayCol,
        saturdayCol,
        rplhCol: rplhCol >= 0 ? rplhCol : TARGET_RPLH_COL,
        noteCol: noteCol >= 0 ? noteCol : NOTE_COL,
      };
    }
  }
  return {
    headerRow: 0,
    weekdayCol: WEEKDAY_LABOR_COL,
    saturdayCol: SATURDAY_LABOR_COL,
    rplhCol: TARGET_RPLH_COL,
    noteCol: NOTE_COL,
  };
}

/**
 * 解析「依人力計算」格式：H 週一～五每日工時、I 週六工時。
 * 月目標工時 = H×平日工作天 + I×週六工作天；月業績 = 目標人效×月目標工時。
 */
function parseHeadcountLaborTargetSheet(buffer: Buffer): {
  stores: ParsedHeadcountRow[];
  warnings: string[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (rows.length < 2) {
    return { stores: [], warnings: ["工作表無資料列"] };
  }

  const { headerRow, weekdayCol, saturdayCol, rplhCol, noteCol } =
    findHeadcountHeaderRow(rows);
  const warnings: string[] = [];
  const header = (rows[headerRow] ?? []).map((c) => String(c ?? "").trim());
  const formatError = assertHeadcountLaborColumns(header, weekdayCol, saturdayCol);
  if (formatError) {
    return { stores: [], warnings: [formatError] };
  }

  const stores: ParsedHeadcountRow[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const region = String(row[REGION_COL] ?? "").trim();
    const storeLabel = String(row[STORE_COL] ?? "").trim();
    if (isSkippableRow(storeLabel)) continue;

    const weekdayDailyHours = parseNumericCell(row[weekdayCol]) ?? 0;
    const saturdayDailyHours = parseNumericCell(row[saturdayCol]) ?? 0;
    if (weekdayDailyHours <= 0 && saturdayDailyHours <= 0) {
      warnings.push(`${storeLabel}：週一至五／週六工時皆為 0，略過`);
      continue;
    }

    const targetRplh = parseNumericCell(row[rplhCol]);
    if (targetRplh == null || targetRplh <= 0) {
      warnings.push(`${storeLabel}：缺少目標人效，略過`);
      continue;
    }

    stores.push({
      region,
      storeLabel,
      storeKey: normalizeStoreKey(storeLabel),
      weekdayDailyHours,
      saturdayDailyHours,
      targetRplh,
      note: String(row[noteCol] ?? "").trim() || undefined,
    });
  }

  if (stores.length === 0) {
    warnings.push(
      "未解析到任何門市列，請確認 H 欄（週一～五）、I 欄（週六）與 B 欄門市名稱"
    );
  }

  return { stores, warnings };
}

function expandHeadcountToMonthlyLabor(
  row: ParsedHeadcountRow,
  year: number,
  holidayYmdSet: Set<string>
): { month: number; laborHourTarget: number }[] {
  const out: { month: number; laborHourTarget: number }[] = [];
  for (let month = 1; month <= 12; month++) {
    const { startYmd, endYmd } = monthStartEndYmd(year, month);
    const split = splitWeekdaySaturdayWorkingDaysInRangeUTC(
      startYmd,
      endYmd,
      holidayYmdSet
    );
    const workingDays = split.weekday + split.saturday;
    if (workingDays <= 0) continue;

    const laborHourTarget =
      Math.round(
        (row.weekdayDailyHours * split.weekday +
          row.saturdayDailyHours * split.saturday) *
          100
      ) / 100;
    out.push({ month, laborHourTarget });
  }
  return out;
}

function assertHeadcountLaborColumns(
  header: string[],
  weekdayCol: number,
  saturdayCol: number
): string | null {
  const wd = normalizeHeaderLabel(header[weekdayCol] ?? "");
  const sat = normalizeHeaderLabel(header[saturdayCol] ?? "");
  if (MONTH_HEADER_RE.test(wd) || MONTH_HEADER_RE.test(sat)) {
    return "此檔案似為「月目標工時」格式（H/I 為 YYYY-MM 欄），請改上傳「依人力計算」檔（H=週一～五預估工時/日、I=週六預估工時）";
  }
  return null;
}

function parseMonthlySheet(
  buffer: Buffer,
  expectedYear: number
): { stores: ParsedStoreRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (rows.length < 2) {
    return { stores: [], warnings: ["工作表無資料列"] };
  }

  const header = rows[0].map((c) => String(c ?? "").trim());
  const monthCols: { month: number; col: number }[] = [];
  const warnings: string[] = [];

  header.forEach((h, col) => {
    const m = MONTH_HEADER_RE.exec(h);
    if (!m) return;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year !== expectedYear) {
      warnings.push(`略過非 ${expectedYear} 年欄位：${h}`);
      return;
    }
    if (month >= 1 && month <= 12) {
      monthCols.push({ month, col });
    }
  });

  if (monthCols.length === 0) {
    return { stores: [], warnings: ["找不到 YYYY-MM 格式的月份欄位"] };
  }

  const noteCol = header.findIndex((h) => h === "備註");

  const stores: ParsedStoreRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const region = String(row[0] ?? "").trim();
    const storeLabel = String(row[1] ?? "").trim();
    if (isSkippableRow(storeLabel)) continue;

    const months: MonthValues = new Map();
    for (const { month, col } of monthCols) {
      const val = parseNumericCell(row[col]);
      if (val != null && val > 0) months.set(month, val);
    }
    if (months.size === 0) continue;

    stores.push({
      region,
      storeLabel,
      storeKey: normalizeStoreKey(storeLabel),
      months,
      note: noteCol >= 0 ? String(row[noteCol] ?? "").trim() || undefined : undefined,
    });
  }

  return { stores, warnings };
}

async function writeStoreTargets(input: {
  year: number;
  rowsToWrite: {
    storeId: string;
    year: number;
    month: number;
    salesTarget: number;
    laborHourTarget: number;
    rplhTarget: number | null;
    note: string | null;
  }[];
  storeIdByKey: Map<string, string>;
  laborProfileByStoreId: Map<string, StoreLaborProfile>;
  regionByStoreId: Map<string, string>;
}): Promise<number> {
  const { year, rowsToWrite, storeIdByKey, laborProfileByStoreId, regionByStoreId } =
    input;

  for (const [storeId, profile] of laborProfileByStoreId) {
    const region = regionByStoreId.get(storeId);
    await prisma.retailStore.update({
      where: { id: storeId },
      data: {
        ...(region ? { region } : {}),
        weekdayBusinessHours: profile.weekdayDailyHours,
        saturdayBusinessHours: profile.saturdayDailyHours,
        defaultLaborHoursPerDay: profile.weekdayDailyHours,
      },
    });
  }

  const storeIdsToReplace = [...storeIdByKey.values()];
  if (rowsToWrite.length > 0) {
    await prisma.$transaction([
      prisma.storeTarget.deleteMany({
        where: { year, storeId: { in: storeIdsToReplace } },
      }),
      prisma.storeTarget.createMany({ data: rowsToWrite }),
    ]);
  }

  return rowsToWrite.length;
}

/**
 * 標準匯入：月業績目標檔（C～N 各月業績）+ 依人力計算檔（H/I 展開各月工時）
 */
export async function importStoreTargetsFromSalesAndHeadcountExcel(input: {
  year: number;
  salesFile: Buffer;
  headcountFile: Buffer;
}): Promise<StoreTargetImportResult> {
  const { year, salesFile, headcountFile } = input;
  const warnings: string[] = [];

  const sync = await ensureRetailStoresFromPerformance();
  if (sync.created > 0) {
    warnings.push(
      `已自動建立 ${sync.created} 間營運門市（由績效門市同步），請確認後再匯入目標`
    );
  }

  const holidayYmdSet = await loadHolidayYmdSet(year);
  const salesParsed = parseMonthlySheet(salesFile, year);
  const headcountParsed = parseHeadcountLaborTargetSheet(headcountFile);
  warnings.push(...salesParsed.warnings, ...headcountParsed.warnings);

  if (headcountParsed.warnings.some((w) => w.includes("月目標工時"))) {
    return {
      year,
      upserted: 0,
      skipped: 0,
      matchedStores: 0,
      unmatchedStores: [],
      warnings: warnings.slice(0, 50),
    };
  }

  const salesByKey = new Map(
    salesParsed.stores.map((s) => [s.storeKey, s] as const)
  );
  const headcountByKey = new Map(
    headcountParsed.stores.map((s) => [s.storeKey, s] as const)
  );
  const allKeys = new Set([...salesByKey.keys(), ...headcountByKey.keys()]);

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });

  const unmatchedStores: string[] = [];
  const storeIdByKey = new Map<string, string>();
  const laborProfileByStoreId = new Map<string, StoreLaborProfile>();
  const regionByStoreId = new Map<string, string>();
  let skipped = 0;

  type WriteRow = {
    storeId: string;
    year: number;
    month: number;
    salesTarget: number;
    laborHourTarget: number;
    rplhTarget: number | null;
    note: string | null;
  };
  const rowsToWrite: WriteRow[] = [];

  for (const key of allKeys) {
    const salesRow = salesByKey.get(key);
    const headcountRow = headcountByKey.get(key);
    const label = salesRow?.storeLabel ?? headcountRow?.storeLabel ?? key;
    const region = salesRow?.region ?? headcountRow?.region ?? "";

    if (!salesRow) {
      warnings.push(`${label}：月業績檔無此門市，略過`);
      continue;
    }
    if (!headcountRow) {
      unmatchedStores.push(`${label}（缺依人力計算檔）`);
      continue;
    }

    const retail = resolveRetailStore(key, label, retailStores);
    if (!retail) {
      unmatchedStores.push(label);
      continue;
    }

    storeIdByKey.set(key, retail.id);
    laborProfileByStoreId.set(retail.id, {
      weekdayDailyHours: headcountRow.weekdayDailyHours,
      saturdayDailyHours: headcountRow.saturdayDailyHours,
    });
    if (region) regionByStoreId.set(retail.id, region);

    const laborByMonth = new Map(
      expandHeadcountToMonthlyLabor(headcountRow, year, holidayYmdSet).map(
        (m) => [m.month, m.laborHourTarget] as const
      )
    );

    for (let month = 1; month <= 12; month++) {
      const salesTarget = salesRow.months.get(month) ?? null;
      const laborHourTarget = laborByMonth.get(month) ?? null;

      if (
        salesTarget == null ||
        laborHourTarget == null ||
        salesTarget <= 0 ||
        laborHourTarget <= 0
      ) {
        if (
          (salesTarget != null && salesTarget > 0) ||
          (laborHourTarget != null && laborHourTarget > 0)
        ) {
          skipped += 1;
          if (warnings.length < 50) {
            warnings.push(
              `${label} ${year}/${month}：缺少業績或工時，略過（需月業績檔與依人力檔皆有有效值）`
            );
          }
        }
        continue;
      }

      const rplh = computeRplhTarget(salesTarget, laborHourTarget);
      rowsToWrite.push({
        storeId: retail.id,
        year,
        month,
        salesTarget,
        laborHourTarget,
        rplhTarget: rplh ? Number(rplh) : null,
        note: salesRow.note ?? headcountRow.note ?? null,
      });
    }
  }

  const upserted = await writeStoreTargets({
    year,
    rowsToWrite,
    storeIdByKey,
    laborProfileByStoreId,
    regionByStoreId,
  });

  return {
    year,
    upserted,
    skipped,
    matchedStores: storeIdByKey.size,
    unmatchedStores: [...new Set(unmatchedStores)],
    warnings: warnings.slice(0, 50),
  };
}

/** 僅依人力檔（H/I → 工時，業績 = 目標人效 × 工時）；建議改用上方的雙檔匯入 */
export async function importStoreTargetsFromHeadcountExcel(input: {
  year: number;
  file: Buffer;
}): Promise<StoreTargetImportResult> {
  const { year, file } = input;
  const warnings: string[] = [];

  const sync = await ensureRetailStoresFromPerformance();
  if (sync.created > 0) {
    warnings.push(
      `已自動建立 ${sync.created} 間營運門市（由績效門市同步），請確認後再匯入目標`
    );
  }

  const holidayYmdSet = await loadHolidayYmdSet(year);
  const parsed = parseHeadcountLaborTargetSheet(file);
  warnings.push(...parsed.warnings);

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });

  const unmatchedStores: string[] = [];
  const storeIdByKey = new Map<string, string>();
  const laborProfileByStoreId = new Map<string, StoreLaborProfile>();
  const regionByStoreId = new Map<string, string>();
  let skipped = 0;

  type WriteRow = {
    storeId: string;
    year: number;
    month: number;
    salesTarget: number;
    laborHourTarget: number;
    rplhTarget: number | null;
    note: string | null;
  };
  const rowsToWrite: WriteRow[] = [];

  for (const row of parsed.stores) {
    const retail = resolveRetailStore(row.storeKey, row.storeLabel, retailStores);
    if (!retail) {
      unmatchedStores.push(row.storeLabel);
      continue;
    }

    storeIdByKey.set(row.storeKey, retail.id);
    laborProfileByStoreId.set(retail.id, {
      weekdayDailyHours: row.weekdayDailyHours,
      saturdayDailyHours: row.saturdayDailyHours,
    });
    if (row.region) regionByStoreId.set(retail.id, row.region);

    const monthly = expandHeadcountToMonthlyLabor(row, year, holidayYmdSet);
    for (const m of monthly) {
      const salesTarget = Math.round(row.targetRplh * m.laborHourTarget * 100) / 100;
      const rplh = computeRplhTarget(salesTarget, m.laborHourTarget);
      rowsToWrite.push({
        storeId: retail.id,
        year,
        month: m.month,
        salesTarget,
        laborHourTarget: m.laborHourTarget,
        rplhTarget: rplh ? Number(rplh) : null,
        note: row.note ?? null,
      });
    }
  }

  const upserted = await writeStoreTargets({
    year,
    rowsToWrite,
    storeIdByKey,
    laborProfileByStoreId,
    regionByStoreId,
  });

  return {
    year,
    upserted,
    skipped,
    matchedStores: storeIdByKey.size,
    unmatchedStores: [...new Set(unmatchedStores)],
    warnings: warnings.slice(0, 50),
  };
}

/** 舊格式：月業績 + 月工時兩檔（YYYY-MM 欄位） */
export async function importStoreTargetsFromExcel(input: {
  year: number;
  salesFile: Buffer;
  hoursFile: Buffer;
}): Promise<StoreTargetImportResult> {
  const { year, salesFile, hoursFile } = input;
  const warnings: string[] = [];

  const sync = await ensureRetailStoresFromPerformance();
  if (sync.created > 0) {
    warnings.push(
      `已自動建立 ${sync.created} 間營運門市（由績效門市同步），請確認後再匯入目標`
    );
  }

  const salesParsed = parseMonthlySheet(salesFile, year);
  const hoursParsed = parseMonthlySheet(hoursFile, year);
  warnings.push(...salesParsed.warnings, ...hoursParsed.warnings);

  const salesByKey = new Map(
    salesParsed.stores.map((s) => [s.storeKey, s] as const)
  );
  const hoursByKey = new Map(
    hoursParsed.stores.map((s) => [s.storeKey, s] as const)
  );

  const allKeys = new Set([...salesByKey.keys(), ...hoursByKey.keys()]);
  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });

  const existingTargets = await prisma.storeTarget.findMany({
    where: { year },
    select: {
      storeId: true,
      month: true,
      salesTarget: true,
      laborHourTarget: true,
      note: true,
    },
  });

  const existingByStoreMonth = new Map<string, (typeof existingTargets)[0]>();
  for (const t of existingTargets) {
    existingByStoreMonth.set(`${t.storeId}|${t.month}`, t);
  }

  const unmatchedStores: string[] = [];
  const storeIdByKey = new Map<string, string>();
  const laborProfileByStoreId = new Map<string, StoreLaborProfile>();
  const regionByStoreId = new Map<string, string>();
  let skipped = 0;

  type WriteRow = {
    storeId: string;
    year: number;
    month: number;
    salesTarget: number;
    laborHourTarget: number;
    rplhTarget: number | null;
    note: string | null;
  };
  const rowsToWrite: WriteRow[] = [];

  for (const key of allKeys) {
    const salesRow = salesByKey.get(key);
    const hoursRow = hoursByKey.get(key);
    const label = salesRow?.storeLabel ?? hoursRow?.storeLabel ?? key;
    const region = salesRow?.region ?? hoursRow?.region ?? "";

    let storeId = storeIdByKey.get(key);
    if (!storeId) {
      const retail = resolveRetailStore(key, label, retailStores);
      if (!retail) {
        unmatchedStores.push(label);
        continue;
      }
      storeId = retail.id;
      storeIdByKey.set(key, storeId);
      if (region) regionByStoreId.set(storeId, region);
    }

    for (let month = 1; month <= 12; month++) {
      const salesVal = salesRow?.months.get(month);
      const hoursVal = hoursRow?.months.get(month);
      const existing = existingByStoreMonth.get(`${storeId}|${month}`);

      const salesTarget =
        salesVal ?? (existing ? Number(existing.salesTarget) : null);
      const laborHourTarget =
        hoursVal ?? (existing ? Number(existing.laborHourTarget) : null);

      if (
        salesTarget == null ||
        laborHourTarget == null ||
        salesTarget <= 0 ||
        laborHourTarget <= 0
      ) {
        if (salesVal != null || hoursVal != null) {
          skipped += 1;
          if (warnings.length < 50) {
            warnings.push(
              `${label} ${year}/${month}：缺少業績或工時，略過（需兩檔皆有或 DB 已有另一項）`
            );
          }
        }
        continue;
      }

      const rplh = computeRplhTarget(salesTarget, laborHourTarget);
      rowsToWrite.push({
        storeId,
        year,
        month,
        salesTarget,
        laborHourTarget,
        rplhTarget: rplh ? Number(rplh) : null,
        note:
          salesRow?.note ??
          (existing?.note ? String(existing.note) : null) ??
          null,
      });
    }
  }

  const upserted = await writeStoreTargets({
    year,
    rowsToWrite,
    storeIdByKey,
    laborProfileByStoreId,
    regionByStoreId,
  });

  return {
    year,
    upserted,
    skipped,
    matchedStores: storeIdByKey.size,
    unmatchedStores: [...new Set(unmatchedStores)],
    warnings: warnings.slice(0, 50),
  };
}
