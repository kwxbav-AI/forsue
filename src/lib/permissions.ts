import type { UserRole } from "@prisma/client";

/** 角色中文說明（介面顯示） */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理員",
  EDITOR: "編輯者",
  VIEWER: "檢視者",
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

/** 頁面（不含 API）是否可進入 */
export function canAccessPage(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
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

/** API 依角色與 HTTP 方法 */
export function canAccessApi(role: UserRole, pathname: string, method: string): boolean {
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
