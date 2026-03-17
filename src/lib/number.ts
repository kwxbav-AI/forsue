import Decimal from "decimal.js";

/** 安全轉成 Decimal，無效則 null */
export function toDecimal(value: unknown): Decimal | null {
  if (value == null || value === "") return null;
  if (Decimal.isDecimal(value)) return value as Decimal;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return new Decimal(n);
}

/** 必填數值，無法解析則拋錯 */
export function requireDecimal(value: unknown, fieldName: string): Decimal {
  const d = toDecimal(value);
  if (d === null) throw new Error(`${fieldName} 必須為有效數值`);
  return d;
}

/** 四捨五入到小數位數 */
export function roundDecimal(d: Decimal, places: number): Decimal {
  return d.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}
