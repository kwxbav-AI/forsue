/** 解析排班時間字串（HH:mm）為分鐘數 */
function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 從出勤記錄解析「表訂工時（小時）」，依序嘗試：
 * 1. scheduledWorkHours 欄位（直接儲存值）
 * 2. shiftType 欄位解析（PT-13:00-19:00 / FT-10:00-18:00）
 * 3. startTime ~ endTime 差值
 *
 * 回傳 null 表示無法判斷表訂工時。
 */
/** 從班別字串（如 "FT-10:00-18:00"、"司機-07:30-15:30"）解析工時 */
function parseShiftString(s: string): number | null {
  const m = s.match(/-(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return null;
  const start = parseTimeToMinutes(m[1]);
  const end = parseTimeToMinutes(m[2]);
  if (start != null && end != null && end > start) return (end - start) / 60;
  return null;
}

export function resolveScheduledHours(record: {
  scheduledWorkHours?: unknown;
  shiftType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): number | null {
  if (record.scheduledWorkHours != null) {
    const n = Number(record.scheduledWorkHours);
    if (Number.isFinite(n) && n > 0) return n;
    // 字串格式：班別-HH:mm-HH:mm（如 "FT-10:00-18:00"、"司機-07:30-15:30"）
    if (typeof record.scheduledWorkHours === "string") {
      const h = parseShiftString(record.scheduledWorkHours);
      if (h != null) return h;
    }
  }
  if (record.shiftType) {
    const h = parseShiftString(record.shiftType);
    if (h != null) return h;
  }
  if (record.startTime && record.endTime) {
    const s = parseTimeToMinutes(record.startTime);
    const e = parseTimeToMinutes(record.endTime);
    if (s != null && e != null && e > s) return (e - s) / 60;
  }
  return null;
}
