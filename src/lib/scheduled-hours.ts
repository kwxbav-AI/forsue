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
export function resolveScheduledHours(record: {
  scheduledWorkHours?: unknown;
  shiftType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): number | null {
  if (record.scheduledWorkHours != null) {
    const n = Number(record.scheduledWorkHours);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (record.shiftType) {
    const m = record.shiftType.match(/(?:PT|FT|[A-Z]+)-(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i);
    if (m) {
      const s = parseTimeToMinutes(m[1]);
      const e = parseTimeToMinutes(m[2]);
      if (s != null && e != null && e > s) return (e - s) / 60;
    }
  }
  if (record.startTime && record.endTime) {
    const s = parseTimeToMinutes(record.startTime);
    const e = parseTimeToMinutes(record.endTime);
    if (s != null && e != null && e > s) return (e - s) / 60;
  }
  return null;
}
