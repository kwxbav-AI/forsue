/** 營運門市營業時長：週一～五 vs 週六 */

export type RetailBusinessHoursInput = {
  weekdayBusinessHours?: number | null;
  saturdayBusinessHours?: number | null;
  /** 舊欄位；若僅傳此值則視為平日時長 */
  dailyBusinessHours?: number | null;
};

export type NormalizedRetailBusinessHours = {
  weekdayBusinessHours: number | null;
  saturdayBusinessHours: number | null;
  /** 與平日同步，供舊程式讀取 */
  dailyBusinessHours: number | null;
};

export function normalizeRetailBusinessHours(
  input: RetailBusinessHoursInput
): NormalizedRetailBusinessHours {
  let weekday: number | null | undefined = input.weekdayBusinessHours;
  const saturday: number | null =
    input.saturdayBusinessHours === undefined ?
      null
    : input.saturdayBusinessHours;

  if (weekday === undefined && input.dailyBusinessHours !== undefined) {
    weekday = input.dailyBusinessHours;
  }
  if (weekday === undefined) {
    weekday = null;
  }

  return {
    weekdayBusinessHours: weekday ?? null,
    saturdayBusinessHours: saturday,
    dailyBusinessHours: weekday ?? null,
  };
}

export function formatRetailBusinessHoursDisplay(hours: {
  weekdayBusinessHours?: number | null;
  saturdayBusinessHours?: number | null;
  dailyBusinessHours?: number | null;
}): string {
  const weekday = hours.weekdayBusinessHours ?? hours.dailyBusinessHours ?? null;
  const saturday = hours.saturdayBusinessHours ?? null;

  if (weekday == null && saturday == null) return "—";

  if (weekday != null && saturday != null && saturday !== weekday) {
    return `平日 ${formatHourNum(weekday)} / 週六 ${formatHourNum(saturday)} hr`;
  }
  if (weekday != null && saturday != null) {
    return `${formatHourNum(weekday)} hr（全日）`;
  }
  if (weekday != null) {
    return `平日 ${formatHourNum(weekday)} hr`;
  }
  return `週六 ${formatHourNum(saturday!)} hr`;
}

function formatHourNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
