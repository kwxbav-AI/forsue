/**
 * 現貨文頁面：規劃書說明「不是每天更新、異動時才更新」，
 * 且「沒有固定對照表、須支援人工輸入扣時數」。
 * 此 parser 先做佔位，實際欄位可依日後 Excel 格式再補強。
 */
import { parseExcelBuffer } from "./base.parser";
import type { ParseResult } from "../types";

export interface InventoryReferenceRow {
  /** 預留：可擴充現貨文參考欄位 */
  [key: string]: unknown;
}

export function parseInventoryReferenceSheet(buffer: Buffer): ParseResult<InventoryReferenceRow> {
  const rows = parseExcelBuffer(buffer);
  if (rows.length < 1) {
    return { data: [], errors: [{ row: 0, message: "檔案為空或無有效內容" }] };
  }

  const data: InventoryReferenceRow[] = [];
  const header = (rows[0] as unknown[]).map((c) => String(c ?? "").trim());
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const obj: InventoryReferenceRow = {};
    header.forEach((key, idx) => {
      if (key) obj[key] = row[idx];
    });
    if (Object.keys(obj).length > 0) data.push(obj);
  }

  return { data, errors: [] };
}
