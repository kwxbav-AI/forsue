import Decimal from "decimal.js";

/** RPLH = 月業績目標 / 月工時目標 */
export function computeRplhTarget(
  salesTarget: Decimal | number,
  laborHourTarget: Decimal | number
): Decimal | null {
  const sales = Decimal.isDecimal(salesTarget) ? salesTarget : new Decimal(salesTarget);
  const hours = Decimal.isDecimal(laborHourTarget)
    ? laborHourTarget
    : new Decimal(laborHourTarget);
  if (hours.isZero()) return null;
  return sales.div(hours).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}
