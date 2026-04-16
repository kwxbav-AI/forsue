/** 登入 Cookie 名稱（httpOnly） */
export const SESSION_COOKIE_NAME = "dps_session";

/**
 * 是否啟用網頁登入：設定 AUTH_SECRET（至少 16 字元）後，
 * 以資料庫 AppUser 帳號登入；未設定則不攔截（與舊版相容）。
 */
export function isAuthEnabled(): boolean {
  const s = process.env.AUTH_SECRET;
  return Boolean(s && s.length >= 16);
}
