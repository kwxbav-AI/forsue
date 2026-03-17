import * as XLSX from "xlsx";

export type SheetRow = unknown[];

/** 讀取 .xlsx 第一個 worksheet 為二維陣列 */
export function readFirstSheet(buffer: Buffer): SheetRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Excel 檔案沒有工作表");
  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return data as SheetRow[];
}

/** 過濾空白列（整列都空） */
export function skipEmptyRows(rows: SheetRow[]): SheetRow[] {
  return rows.filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));
}
