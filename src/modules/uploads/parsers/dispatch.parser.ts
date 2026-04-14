import { parseISO, isValid } from "date-fns";
import Decimal from "decimal.js";
import { parseExcelBuffer, getCell, validateRequiredColumns } from "./base.parser";
import {
  DISPATCH_COLUMNS,
  buildHeaderMap,
  type ColumnMapping,
} from "../column-mapping";
import type { ParseResult, ParseError } from "../types";
import { toDecimal } from "@/lib/number";

export interface DispatchRow {
  workDate: Date;
  employeeCode: string;
  fromStoreCode: string | null;
  toStoreCode: string;
  dispatchHours: Decimal;
  remark: string | null;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function parseDispatchSheet(buffer: Buffer): ParseResult<DispatchRow> {
  const rows = parseExcelBuffer(buffer);
  if (rows.length < 2) {
    return { data: [], errors: [{ row: 0, message: "檔案至少需有表頭與一筆資料" }] };
  }

  const headerMap = buildHeaderMap(rows[0], DISPATCH_COLUMNS as ColumnMapping);
  const required = ["workDate", "employeeCode", "toStoreCode", "dispatchHours"];
  const columnErrors = validateRequiredColumns(
    headerMap,
    required,
    DISPATCH_COLUMNS as ColumnMapping
  );
  if (columnErrors.length > 0) return { data: [], errors: columnErrors };

  const data: DispatchRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const workDateStr = getCell(row, headerMap.workDate);
    const employeeCode = getCell(row, headerMap.employeeCode);
    const toStoreCode = getCell(row, headerMap.toStoreCode);
    const dispatchHoursStr = getCell(row, headerMap.dispatchHours);

    const workDate = workDateStr ? parseDate(workDateStr) : null;
    if (!workDate) {
      errors.push({ row: i + 1, field: "workDate", message: "調度日期格式錯誤或空白" });
      continue;
    }
    if (!employeeCode) {
      errors.push({ row: i + 1, field: "employeeCode", message: "員工代碼不可空白" });
      continue;
    }
    if (!toStoreCode) {
      errors.push({ row: i + 1, field: "toStoreCode", message: "調入店不可空白" });
      continue;
    }

    const dispatchHours = toDecimal(dispatchHoursStr);
    if (dispatchHours === null || dispatchHours.lte(0)) {
      errors.push({ row: i + 1, field: "dispatchHours", message: "調度時數必須為有效正數" });
      continue;
    }

    const fromStoreCode = headerMap.fromStoreCode !== undefined ? getCell(row, headerMap.fromStoreCode) || null : null;
    const remark = headerMap.remark !== undefined ? getCell(row, headerMap.remark) || null : null;

    data.push({
      workDate,
      employeeCode,
      fromStoreCode: fromStoreCode || null,
      toStoreCode,
      dispatchHours,
      remark: remark || null,
    });
  }

  return { data, errors };
}
