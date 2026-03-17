import { readFirstSheet, skipEmptyRows } from "@/lib/excel";
import type { SheetRow } from "@/lib/excel";
import type { ParseError } from "../types";
import type { ColumnMapping } from "../column-mapping";
import { buildHeaderMap } from "../column-mapping";

export function parseExcelBuffer(buffer: Buffer): SheetRow[] {
  const rows = readFirstSheet(buffer);
  return skipEmptyRows(rows);
}

export function getCell(row: SheetRow, index: number): string {
  const raw = row[index];
  if (raw == null) return "";
  return String(raw).trim();
}

export function validateRequiredColumns(
  headerMap: Record<string, number>,
  required: string[],
  columnDef: ColumnMapping
): ParseError[] {
  const errors: ParseError[] = [];
  for (const key of required) {
    if (headerMap[key] === undefined) {
      const names = columnDef[key];
      errors.push({
        row: 0,
        field: key,
        message: `缺少必填欄位：${key}（可接受欄名：${(names as string[]).join("、")}）`,
      });
    }
  }
  return errors;
}
