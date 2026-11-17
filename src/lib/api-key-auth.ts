/**
 * 外部系統 API Key 驗證
 *
 * 使用方式：外部系統在 HTTP request header 加入：
 *   X-API-Key: <金鑰>
 *
 * 金鑰設定於環境變數 EXTERNAL_API_KEY。
 *
 * 回傳值語意：
 *   "disabled"     — 未設定 EXTERNAL_API_KEY，此驗證功能停用
 *   "absent"       — 功能已啟用，但請求沒有帶 x-api-key header
 *                    （呼叫端應回退到 cookie session 驗證，這是一般網頁使用者的情況）
 *   "unauthorized" — 有帶 header 但金鑰不正確
 *   "ok"           — 金鑰正確
 *
 * 注意「absent」與「unauthorized」必須分開：若把「沒帶 header」也當成
 * unauthorized，一旦設定了 EXTERNAL_API_KEY，瀏覽器（不會送此 header）的請求
 * 就會被判定失敗，導致網頁版報表對所有已登入使用者壞掉。
 */
type ApiKeyResult = "ok" | "unauthorized" | "absent" | "disabled";

export function validateApiKey(request: Request): ApiKeyResult {
  return checkApiKey(request, process.env.EXTERNAL_API_KEY);
}

/**
 * 會計系統推送每日營收（寫入）專用金鑰，環境變數 REVENUE_IMPORT_API_KEY。
 *
 * 刻意跟唯讀的 EXTERNAL_API_KEY 分成兩支函式、而不是 validateApiKey 加一個「金鑰名稱」
 * 參數：若用預設參數，漏設 REVENUE_IMPORT_API_KEY 時傳進 undefined 會退回預設值，
 * 變成唯讀金鑰也能寫入營收。分開寫，沒設定就是 "disabled"，不會互相借用。
 * （process.env 也要寫死名稱，middleware 跑在 Edge runtime，動態 process.env[name] 不保證讀得到）
 */
export function validateRevenueImportKey(request: Request): ApiKeyResult {
  return checkApiKey(request, process.env.REVENUE_IMPORT_API_KEY);
}

function checkApiKey(request: Request, configured: string | undefined): ApiKeyResult {
  if (!configured) return "disabled"; // 未設定 → 此驗證停用

  const incoming = (request.headers as Headers).get("x-api-key");
  if (!incoming) return "absent"; // 沒帶金鑰 → 交給呼叫端決定如何回退

  // 固定時間比較，避免以回應時間逐字推敲金鑰內容。
  // （長度不同時提早返回，僅洩漏長度，不洩漏內容。）
  const enc = new TextEncoder();
  const a = enc.encode(configured);
  const b = enc.encode(incoming);
  if (a.length !== b.length) return "unauthorized";

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? "ok" : "unauthorized";
}

/**
 * 開放外部系統以 API Key 存取的路徑白名單（完全比對）。
 *
 * 目前僅開放店務平台每日會計核實營收比對所需的這一支。新增前請確認該端點
 * 為唯讀且不含個資——帶金鑰的請求會跳過整套角色權限檢查。
 */
const EXTERNAL_API_ALLOWED_PATHS = new Set<string>(["/api/reports/revenue"]);

/** 此路徑是否開放外部系統以 API Key 存取。 */
export function isExternalApiPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "");
  return EXTERNAL_API_ALLOWED_PATHS.has(normalized === "" ? "/" : normalized);
}
