import type { UserRole } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth-session";

/** 角色中文說明（介面顯示） */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理員",
  EDITOR: "編輯者",
  VIEWER: "檢視者",
  STORE_STAFF: "門市人員",
};

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
 * Token + effective patterns（middleware 會注入）。無匹配即拒絕，不再依角色走 legacy。
 */
export function canAccessPage(session: SessionPayload | null, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/" || pathname === "/forbidden") return true;
  if (!session) return false;

  return matchAllowedPagePatterns(session, pathname);
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

  return matched;
}
