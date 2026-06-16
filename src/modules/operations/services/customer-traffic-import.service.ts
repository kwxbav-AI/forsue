import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { normalizeStoreKey } from "@/lib/operations-dashboard";
import { ensureRetailStoresFromPerformance } from "@/modules/operations/services/retail-store-sync.service";
import { resolveRetailStore } from "@/modules/operations/services/retail-store-match.service";

/** TMS 銷售毛利分析報表的部門代碼對照表 */
const DEPT_CODE_TO_STORE: Record<string, string> = {
  "001": "中正店",
  "002": "義成店",
  "003": "宜蘭店",
  "004": "南竹店",
  "005": "北成店",
  "006": "女中店",
  "007": "力行店",
  "008": "五福店",
  "009": "中北店",
  "010": "五結店",
  "011": "中埔店",
  "015": "中正南店",
  "016": "大竹店",
  "017": "內壢店",
  "018": "礁溪店",
  "020": "昆明店",
  "021": "馬賽店",
  "022": "東勇店",
  "023": "校舍店",
  "024": "大有店",
};

export type CustomerTrafficImportResult = {
  upserted: number;
  skipped: number;
  unmatchedDepartments: string[];
  warnings: string[];
  message: string;
};

function parseExcelSerialDateCell(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  // Excel 1900 date system serials are typically in this range for recent years
  if (!Number.isFinite(n) || n < 20000 || n > 90000) return null;
  // Excel serial 1 = 1900-01-01; we store as UTC date-only to avoid TZ shifts
  const base = Date.UTC(1899, 11, 31, 0, 0, 0, 0);
  const ms = base + Math.round(n) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return parseDateOnlyUTC(ymd);
}

function parseRocDateCell(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const excel = parseExcelSerialDateCell(raw);
  if (excel) return excel;
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
      cells.some((c) => c === "日期" || c === "交班日期") &&
      cells.some((c) => c === "部門" || c === "門市") &&
      (
        cells.some((c) => /來客/.test(c)) ||
        cells.some((c) => /結帳.*(單數|張數)|單數|張數/.test(c)) ||
        cells.some((c) => c === "銷售筆數")  // TMS 格式
      )
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
  const dateCol = colIndex(header, ["日期", "交班日期"]);
  const deptCol = colIndex(header, ["部門", "門市"]);
  const countCol = colIndex(header, ["來客數", "來客", "結帳單張數", "結帳單數", "結帳單", "銷售筆數"]);
  const salesCol = colIndex(header, ["銷售總額", "銷售額", "營業額", "營收金額", "營收"]);
  const avgCol = colIndex(header, ["平均客單", "當日平均客單", "客單價"]);

  if (dateCol < 0 || deptCol < 0 || countCol < 0) {
    throw new Error("找不到必要欄位：日期/交班日期、部門/門市、來客數/結帳單張數");
  }

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });

  let upserted = 0;
  let skipped = 0;
  let skippedTaipei = 0;
  const unmatched = new Set<string>();
  const warnings: string[] = [];

  // 先彙總（避免同日同店多機號多列造成覆蓋）
  type Agg = { storeId: string; date: Date; customerCount: number; salesAmount: number };
  const aggByStoreDate = new Map<string, Agg>();

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rawDept = String(row[deptCol] ?? "").trim();
    if (!rawDept || /合計|小計|總計/.test(rawDept)) continue;

    // 台北區資料不分析：整段略過
    if (rawDept.includes("台北區") || rawDept.startsWith("台北")) {
      skippedTaipei += 1;
      continue;
    }

    // TMS 部門代碼對照（001 → 中正店）；若不在清單則保留原文字
    const deptLabel = DEPT_CODE_TO_STORE[rawDept] ?? rawDept;

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
    const storeKey = normalizeStoreKey(deptLabel.replace(/店$/, ""));
    const retail = resolveRetailStore(storeKey, deptLabel, retailStores);
    if (!retail) {
      // 記錄原始代碼（或門市名稱），方便回報未對應
      unmatched.add(rawDept !== deptLabel ? `${rawDept}(${deptLabel})` : rawDept);
      skipped++;
      continue;
    }

    const key = `${retail.id}|${workDate.toISOString().slice(0, 10)}`;
    const prev = aggByStoreDate.get(key);
    if (prev) {
      prev.customerCount += customerCount;
      if (salesAmount != null) prev.salesAmount += salesAmount;
    } else {
      aggByStoreDate.set(key, {
        storeId: retail.id,
        date: workDate,
        customerCount,
        salesAmount: salesAmount ?? 0,
      });
    }
  }

  for (const a of aggByStoreDate.values()) {
    const avgOrderValue =
      a.customerCount > 0 ? Math.round((a.salesAmount / a.customerCount) * 100) / 100 : null;
    await prisma.dailyStorePerformance.upsert({
      where: { storeId_date: { storeId: a.storeId, date: a.date } },
      create: {
        storeId: a.storeId,
        date: a.date,
        customerCount: a.customerCount,
        salesAmount: a.salesAmount,
        avgOrderValue,
      },
      update: {
        customerCount: a.customerCount,
        salesAmount: a.salesAmount,
        avgOrderValue,
      },
    });
    upserted += 1;
  }

  const unmatchedDepartments = [...unmatched].sort();
  if (unmatchedDepartments.length > 0) {
    warnings.push(`未對應門市 ${unmatchedDepartments.length} 種：${unmatchedDepartments.slice(0, 8).join("、")}${unmatchedDepartments.length > 8 ? "…" : ""}`);
  }
  if (skippedTaipei > 0) {
    warnings.push(`已略過台北區資料 ${skippedTaipei} 筆`);
  }

  return {
    upserted,
    skipped,
    unmatchedDepartments,
    warnings,
    message: `已匯入 ${upserted} 筆來客／客單資料${skipped > 0 ? `（略過 ${skipped} 筆）` : ""}`,
  };
}
