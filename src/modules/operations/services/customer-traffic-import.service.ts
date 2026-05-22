import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { normalizeStoreKey } from "@/lib/operations-dashboard";
import { ensureRetailStoresFromPerformance } from "@/modules/operations/services/retail-store-sync.service";
import { resolveRetailStore } from "@/modules/operations/services/retail-store-match.service";

export type CustomerTrafficImportResult = {
  upserted: number;
  skipped: number;
  unmatchedDepartments: string[];
  warnings: string[];
  message: string;
};

function parseRocDateCell(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  const rocMatch = s.match(/^(\d{2,3})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    const year = rocYear < 300 ? 1911 + rocYear : rocYear;
    const month = parseInt(rocMatch[2], 10);
    const day = parseInt(rocMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return parseDateOnlyUTC(ymd);
    }
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseDateOnlyUTC(s) : null;
  return iso;
}

function parseIntCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function parseMoneyCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? "").trim());
    if (
      cells.some((c) => c === "日期") &&
      cells.some((c) => c === "部門" || c === "門市") &&
      cells.some((c) => /來客/.test(c))
    ) {
      return r;
    }
  }
  return 0;
}

function colIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.findIndex((h) => h === name || h.includes(name));
    if (i >= 0) return i;
  }
  return -1;
}

export async function importCustomerTrafficFromExcel(
  buffer: Buffer
): Promise<CustomerTrafficImportResult> {
  await ensureRetailStoresFromPerformance();

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  if (rows.length < 2) {
    return {
      upserted: 0,
      skipped: 0,
      unmatchedDepartments: [],
      warnings: ["工作表無資料列"],
      message: "無可匯入資料",
    };
  }

  const headerRow = findHeaderRow(rows);
  const header = (rows[headerRow] ?? []).map((c) => String(c ?? "").trim());
  const dateCol = colIndex(header, ["日期"]);
  const deptCol = colIndex(header, ["部門", "門市"]);
  const countCol = colIndex(header, ["來客數", "來客"]);
  const salesCol = colIndex(header, ["銷售總額", "銷售額", "營業額"]);
  const avgCol = colIndex(header, ["平均客單", "當日平均客單", "客單價"]);

  if (dateCol < 0 || deptCol < 0 || countCol < 0) {
    throw new Error("找不到必要欄位：日期、部門、來客數");
  }

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });

  let upserted = 0;
  let skipped = 0;
  const unmatched = new Set<string>();
  const warnings: string[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const deptLabel = String(row[deptCol] ?? "").trim();
    if (!deptLabel || /合計|小計|總計/.test(deptLabel)) continue;

    const workDate = parseRocDateCell(row[dateCol]);
    if (!workDate) {
      skipped++;
      continue;
    }

    const customerCount = parseIntCell(row[countCol]);
    if (customerCount == null) {
      skipped++;
      continue;
    }

    const salesAmount = salesCol >= 0 ? parseMoneyCell(row[salesCol]) : null;
    let avgOrderValue = avgCol >= 0 ? parseMoneyCell(row[avgCol]) : null;
    if (avgOrderValue == null && salesAmount != null && customerCount > 0) {
      avgOrderValue = Math.round((salesAmount / customerCount) * 100) / 100;
    }

    const storeKey = normalizeStoreKey(deptLabel.replace(/店$/, ""));
    const retail = resolveRetailStore(storeKey, deptLabel, retailStores);
    if (!retail) {
      unmatched.add(deptLabel);
      skipped++;
      continue;
    }

    await prisma.dailyStorePerformance.upsert({
      where: {
        storeId_date: { storeId: retail.id, date: workDate },
      },
      create: {
        storeId: retail.id,
        date: workDate,
        customerCount,
        salesAmount: salesAmount ?? 0,
        avgOrderValue,
      },
      update: {
        customerCount,
        ...(salesAmount != null ? { salesAmount } : {}),
        ...(avgOrderValue != null ? { avgOrderValue } : {}),
      },
    });
    upserted++;
  }

  const unmatchedDepartments = [...unmatched].sort();
  if (unmatchedDepartments.length > 0) {
    warnings.push(`未對應門市 ${unmatchedDepartments.length} 種：${unmatchedDepartments.slice(0, 8).join("、")}${unmatchedDepartments.length > 8 ? "…" : ""}`);
  }

  return {
    upserted,
    skipped,
    unmatchedDepartments,
    warnings,
    message: `已匯入 ${upserted} 筆來客／客單資料${skipped > 0 ? `（略過 ${skipped} 筆）` : ""}`,
  };
}
