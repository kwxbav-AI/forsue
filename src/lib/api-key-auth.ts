/**
 * 外部系統 API Key 驗證
 *
 * 使用方式：外部系統在 HTTP request header 加入：
 *   X-API-Key: <金鑰>
 *
 * 金鑰設定於環境變數 EXTERNAL_API_KEY。
 * 若未設定此變數，此驗證功能停用（回傳 null 表示無法驗證）。
 */
export function validateApiKey(request: Request): "ok" | "unauthorized" | "disabled" {
  const configured = process.env.EXTERNAL_API_KEY;
  if (!configured) return "disabled"; // 未設定 → 此驗證停用

  const incoming = (request.headers as Headers).get("x-api-key");
  if (!incoming) return "unauthorized";

  // 使用 timingSafeEqual 防止 timing attack
  const enc = new TextEncoder();
  const a = enc.encode(configured);
  const b = enc.encode(incoming);
  if (a.length !== b.length) return "unauthorized";

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? "ok" : "unauthorized";
}
