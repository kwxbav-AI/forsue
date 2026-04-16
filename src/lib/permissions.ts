import type { SessionPayload } from "@/lib/auth-session";

/** 角色中文說明（介面顯示） */
export const DEFAULT_ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理員",
  EDITOR: "編輯者",
  VIEWER: "檢視者",
  STORE_STAFF: "門市人員",
} as const;

function isReadMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function matchAllowedPagePatterns(session: SessionPayload, pathname: string): boolean {
  const list = session.allowedPagePathPatterns ?? [];
  for (const p of list) {
    // PAGE pattern 預設採「精準匹配」；若 pattern 以 "/" 結尾，才視為 prefix（涵蓋子路徑）。
    // 目的：避免只開 /reports 入口就讓 /reports/* 全部可進。
    const pat = String(p || "");
    if (!pat) continue;
    // 特例：根路徑 "/" 不能當 prefix，否則會放行全站。
    if (pat === "/") {
      if (pathname === "/") return true;
      continue;
    }
    if (pat.endsWith("/")) {
      if (pathname.startsWith(pat)) return true;
      continue;
    }
    if (pathname === pat) return true;
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
    const pat = String(p.pathPattern || "");
    if (!pat) continue;
    // 防呆：避免用 "/" 或 "/api" 這種超寬字首誤放行整個站/API。
    // 既有 API patterns（例如 /api/dispatches）仍維持 startsWith 行為以涵蓋子路徑。
    const matched =
      pat === "/" || pat === "/api"
        ? pathname === pat
        : pathname.startsWith(pat);
    if (!matched) continue;
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
  if (session.roleKey === "ADMIN") return true;

  return matchAllowedPagePatterns(session, pathname);
}

export function canAccessApi(
  session: SessionPayload | null,
  pathname: string,
  method: string
): boolean {
  if (!session) return false;
  if (session.roleKey === "ADMIN") return true;

  const isRead = isReadMethod(method);
  const matched = isRead
    ? matchAllowedApiPatterns(session.allowedApiReadPatterns ?? [], pathname, method)
    : matchAllowedApiPatterns(session.allowedApiWritePatterns ?? [], pathname, method);

  return matched;
}
