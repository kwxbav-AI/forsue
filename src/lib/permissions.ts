import type { UserRole } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth-session";

/** 角色中文說明（介面顯示） */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理員",
  EDITOR: "編輯者",
  VIEWER: "檢視者",
  STORE_STAFF: "門市人員",
};

function viewerPageAllowed(pathname: string): boolean {
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (pathname.startsWith("/reports")) return true;
  if (pathname === "/data" || pathname.startsWith("/data/")) return true;
  if (
    pathname.startsWith("/performance/daily") ||
    pathname.startsWith("/performance/target-summary")
  ) {
    return true;
  }
  return false;
}

/** Legacy hard-coded rules (fallback) */
function legacyCanAccessPage(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (role === "ADMIN") return true;
  if (role === "EDITOR") {
    if (pathname.startsWith("/settings/users")) return false;
    return true;
  }
  return viewerPageAllowed(pathname);
}

function viewerApiGetAllowed(pathname: string): boolean {
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/stores") return true;
  if (pathname.startsWith("/api/reports/")) return true;
  if (pathname === "/api/performance/daily" || pathname.startsWith("/api/performance/daily/")) {
    if (pathname.includes("employee-hours")) return false;
    return true;
  }
  if (pathname === "/api/performance/target-summary") return true;
  return false;
}

function legacyCanAccessApi(
  role: UserRole,
  pathname: string,
  method: string
): boolean {
  const m = method.toUpperCase();
  if (role === "ADMIN") return true;
  if (role === "EDITOR") {
    if (pathname.startsWith("/api/users")) return false;
    return true;
  }
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") return false;
  if (pathname.startsWith("/api/performance/debug-deduction")) return false;
  return viewerApiGetAllowed(pathname);
}

function isReadMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function matchAllowedPagePatterns(session: SessionPayload, pathname: string): boolean {
  const list = session.allowedPagePathPatterns ?? [];
  for (const p of list) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

function matchAllowedApiPatterns(
  patterns: { pathPattern: string; method: string | null }[],
  pathname: string,
  method: string
): boolean {
  const m = method.toUpperCase();
  for (const p of patterns) {
    if (!pathname.startsWith(p.pathPattern)) continue;
    const needMethod = p.method ?? null;
    if (needMethod && needMethod.toUpperCase() !== m) continue;
    return true;
  }
  return false;
}

/**
 * Token-driven access checks (middleware/edge safe).
 * - 若 token 有匹配模式，依 token 結果判斷。
 * - 若 token 沒有任何匹配：
 *   - ADMIN/EDITOR/VIEWER：fallback 到 legacy 規則
 *   - STORE_STAFF 等新角色：一律 deny
 */
export function canAccessPage(session: SessionPayload | null, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (!session) return false;

  const matched = matchAllowedPagePatterns(session, pathname);
  if (matched) return true;

  if (session.role === "ADMIN" || session.role === "EDITOR" || session.role === "VIEWER") {
    return legacyCanAccessPage(session.role, pathname);
  }
  return false;
}

export function canAccessApi(
  session: SessionPayload | null,
  pathname: string,
  method: string
): boolean {
  if (!session) return false;

  const isRead = isReadMethod(method);
  const matched = isRead
    ? matchAllowedApiPatterns(session.allowedApiReadPatterns ?? [], pathname, method)
    : matchAllowedApiPatterns(session.allowedApiWritePatterns ?? [], pathname, method);

  if (matched) return true;

  if (session.role === "ADMIN" || session.role === "EDITOR" || session.role === "VIEWER") {
    return legacyCanAccessApi(session.role, pathname, method);
  }
  return false;
}
