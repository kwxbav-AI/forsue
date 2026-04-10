/**
 * 離線驗證：打卡地點字串解析與狀態判定（不連 DB）
 *
 * 執行：
 *   node scripts/verify-attendance-location.cjs
 */
function extractStoreTextFromClockInfo(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const withBracket = s.match(/^\s*\[[^\]]+\]\s*(.+?)\s*(\d+\s*公尺.*)?\s*$/);
  const candidate = (withBracket ? withBracket[1] : s).trim();
  if (!candidate) return null;
  const stripped = candidate.replace(/\s+\d+\s*公尺.*$/g, "").trim();
  return stripped || null;
}

function parseClockInfoTimeToMinutes(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function computeLocationMatchStatus({
  excluded,
  hasDispatch,
  baseStoreId,
  clockInStoreId,
  clockOutStoreId,
  clockInMin,
  clockOutMin,
  dispatchStartMin,
  dispatchEndMin,
  dispatchToStoreId,
}) {
  if (excluded && !hasDispatch) return "EXCLUDED";
  if (!baseStoreId) return "UNKNOWN";
  if (!clockInStoreId && !clockOutStoreId) return "UNKNOWN";

  const inOkNoDispatch = clockInStoreId ? clockInStoreId === baseStoreId : null;
  const outOkNoDispatch = clockOutStoreId ? clockOutStoreId === baseStoreId : null;

  if (!hasDispatch) {
    if (inOkNoDispatch === true && outOkNoDispatch === true) return "MATCH";
    if (inOkNoDispatch === false && outOkNoDispatch === true) return "MISMATCH_CLOCKIN";
    if (inOkNoDispatch === true && outOkNoDispatch === false) return "MISMATCH_CLOCKOUT";
    if (inOkNoDispatch === false && outOkNoDispatch === false) return "MISMATCH_BOTH";
    return "UNKNOWN";
  }

  if (!dispatchToStoreId) return "NEED_REVIEW";
  const allowed = new Set([baseStoreId, dispatchToStoreId]);
  const inAllowed = clockInStoreId ? allowed.has(clockInStoreId) : true;
  const outAllowed = clockOutStoreId ? allowed.has(clockOutStoreId) : true;
  if (!inAllowed || !outAllowed) {
    if (clockInStoreId && !allowed.has(clockInStoreId) && clockOutStoreId && !allowed.has(clockOutStoreId))
      return "MISMATCH_BOTH";
    if (clockInStoreId && !allowed.has(clockInStoreId)) return "MISMATCH_CLOCKIN";
    if (clockOutStoreId && !allowed.has(clockOutStoreId)) return "MISMATCH_CLOCKOUT";
  }

  if (dispatchStartMin == null || dispatchEndMin == null || clockInMin == null || clockOutMin == null) {
    return "DISPATCH_EXPLAINED";
  }

  const expectedIn = clockInMin >= dispatchStartMin && clockInMin < dispatchEndMin ? dispatchToStoreId : baseStoreId;
  const expectedOut = clockOutMin >= dispatchStartMin && clockOutMin < dispatchEndMin ? dispatchToStoreId : baseStoreId;
  const inOk = clockInStoreId ? clockInStoreId === expectedIn : true;
  const outOk = clockOutStoreId ? clockOutStoreId === expectedOut : true;

  const dispatchInsideWork = clockInMin < dispatchStartMin && clockOutMin >= dispatchEndMin;
  const bothAtBase = (clockInStoreId ? clockInStoreId === baseStoreId : true) && (clockOutStoreId ? clockOutStoreId === baseStoreId : true);
  if (dispatchInsideWork && bothAtBase) return "NEED_REVIEW";

  if (inOk && outOk) return "DISPATCH_EXPLAINED";
  if (!inOk && outOk) return "MISMATCH_CLOCKIN";
  if (inOk && !outOk) return "MISMATCH_CLOCKOUT";
  return "MISMATCH_BOTH";
}

function assertEqual(label, got, expected) {
  if (got !== expected) {
    console.error(`[FAIL] ${label}\n  got:      ${got}\n  expected: ${expected}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] ${label}: ${got}`);
}

// ---- Case 1: 不符（部門=礁溪店，上班資訊=校舍店） ----
const dep1 = "宜蘭區-礁溪店";
const clockIn1 = "[07:24:14]宜蘭區-校舍店 24公尺";
assertEqual("extract clockIn storeText", extractStoreTextFromClockInfo(clockIn1), "宜蘭區-校舍店");
assertEqual("parse clockIn minutes", parseClockInfoTimeToMinutes(clockIn1), 7 * 60 + 24);
assertEqual(
  "status mismatch clock-in",
  computeLocationMatchStatus({
    excluded: false,
    hasDispatch: false,
    baseStoreId: dep1,
    clockInStoreId: "宜蘭區-校舍店",
    clockOutStoreId: dep1,
    clockInMin: parseClockInfoTimeToMinutes(clockIn1),
    clockOutMin: 18 * 60,
    dispatchStartMin: null,
    dispatchEndMin: null,
    dispatchToStoreId: null,
  }),
  "MISMATCH_CLOCKIN"
);

// ---- Case 2: 相符（部門=南竹店，上班資訊=南竹店） ----
const dep2 = "桃園區-南竹店";
const clockIn2 = "[16:03:55]桃園區-南竹店 86公尺";
assertEqual("extract clockIn storeText 2", extractStoreTextFromClockInfo(clockIn2), "桃園區-南竹店");
assertEqual(
  "status match",
  computeLocationMatchStatus({
    excluded: false,
    hasDispatch: false,
    baseStoreId: dep2,
    clockInStoreId: dep2,
    clockOutStoreId: dep2,
    clockInMin: parseClockInfoTimeToMinutes(clockIn2),
    clockOutMin: 22 * 60,
    dispatchStartMin: null,
    dispatchEndMin: null,
    dispatchToStoreId: null,
  }),
  "MATCH"
);

// ---- Case 3: 有調度時段，但上下班都在原店（需人工確認 / NEED_REVIEW） ----
const dep3 = "A店";
const to3 = "B店";
const clockIn3 = "[09:00:00]A店 1公尺";
const clockOut3 = "[18:00:00]A店 1公尺";
assertEqual(
  "status need_review with midday dispatch",
  computeLocationMatchStatus({
    excluded: false,
    hasDispatch: true,
    baseStoreId: dep3,
    clockInStoreId: dep3,
    clockOutStoreId: dep3,
    clockInMin: parseClockInfoTimeToMinutes(clockIn3),
    clockOutMin: parseClockInfoTimeToMinutes(clockOut3),
    dispatchStartMin: 16 * 60,
    dispatchEndMin: 18 * 60,
    dispatchToStoreId: to3,
  }),
  "NEED_REVIEW"
);

if (!process.exitCode) {
  console.log("All checks passed.");
}

