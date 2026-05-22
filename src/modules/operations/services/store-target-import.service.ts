import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { computeRplhTarget } from "@/lib/operations";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
} from "@/lib/operations-dashboard";

const MONTH_HEADER_RE = /^(\d{4})-(\d{2})$/;

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

function parseNumericCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isSkippableRow(storeLabel: unknown): boolean {
  const s = String(storeLabel ?? "").trim();
  if (!s) return true;
  return /合計|小計|總計|備註說明/.test(s);
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
      if (val != null) months.set(month, val);
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

function resolveRetailStore(
  storeKey: string,
  storeLabel: string,
  retailStores: { id: string; storeName: string; region: string | null }[]
): { id: string; storeName: string } | null {
  const exact = retailStores.find((r) => r.storeName.trim() === storeLabel);
  if (exact) return exact;

  const byKey = retailStores.find((r) => normalizeStoreKey(r.storeName) === storeKey);
  if (byKey) return byKey;

  const fuzzy = retailStores.find(
    (r) =>
      storeNameMatchesCatalogKey(r.storeName, storeKey) ||
      storeNameMatchesCatalogKey(storeLabel, r.storeName) ||
      storeNamesEquivalent(r.storeName, storeLabel)
  );
  return fuzzy ?? null;
}

export async function importStoreTargetsFromExcel(input: {
  year: number;
  salesFile: Buffer;
  hoursFile: Buffer;
}): Promise<StoreTargetImportResult> {
  const { year, salesFile, hoursFile } = input;
  const warnings: string[] = [];

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
  let upserted = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
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

        if (region) {
          await tx.retailStore.update({
            where: { id: storeId },
            data: { region },
          });
        }
      }

      for (let month = 1; month <= 12; month++) {
        const salesVal = salesRow?.months.get(month);
        const hoursVal = hoursRow?.months.get(month);
        const existing = existingByStoreMonth.get(`${storeId}|${month}`);

        const salesTarget =
          salesVal ??
          (existing ? Number(existing.salesTarget) : null);
        const laborHourTarget =
          hoursVal ??
          (existing ? Number(existing.laborHourTarget) : null);

        if (
          salesTarget == null ||
          laborHourTarget == null ||
          salesTarget <= 0 ||
          laborHourTarget <= 0
        ) {
          if (salesVal != null || hoursVal != null) {
            skipped += 1;
            warnings.push(
              `${label} ${year}/${month}：缺少業績或工時目標，略過（需兩檔皆提供或資料庫已有另一項）`
            );
          }
          continue;
        }

        const rplh = computeRplhTarget(salesTarget, laborHourTarget);
        const note =
          salesRow?.note ??
          (existing?.note ? String(existing.note) : null) ??
          null;

        await tx.storeTarget.upsert({
          where: {
            storeId_year_month: { storeId, year, month },
          },
          create: {
            storeId,
            year,
            month,
            salesTarget,
            laborHourTarget,
            rplhTarget: rplh ? Number(rplh) : null,
            note,
          },
          update: {
            salesTarget,
            laborHourTarget,
            rplhTarget: rplh ? Number(rplh) : null,
            note,
          },
        });
        upserted += 1;
      }
    }
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
