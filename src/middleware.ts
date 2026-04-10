import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { decodeSessionToken } from "@/lib/auth-session";
import { canAccessApi, canAccessPage } from "@/lib/permissions";

const PERMISSIONS_CACHE_TTL_MS = 5000;
const effectivePermsCache = new Map<
  string,
  { expiresAt: number; data: { allowedPagePathPatterns: string[]; allowedApiReadPatterns: any[]; allowedApiWritePatterns: any[] } }
>();

function buildCookieHeader(request: NextRequest): string {
  try {
    const list = request.cookies.getAll();
    if (!Array.isArray(list) || list.length === 0) return "";
    return list.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return request.headers.get("cookie") ?? "";
  }
}

function getInternalOrigin(request: NextRequest): string | null {
  // Cloud Run/自架時，middleware 內 fetch 打外部網域有機會失敗；
  // 優先用容器內部 localhost 走同一個 Next 伺服器。
  const port =
    (typeof process !== "undefined" && process.env && (process.env.PORT || process.env.NEXT_PUBLIC_PORT)) || "8080";
  // 只有在 server runtime 才會有 process；Edge 也可能提供，但沒關係，失敗就回到外部 URL。
  if (!port) return null;
  return `http://127.0.0.1:${port}`;
}

function isStaticAsset(pathname: string): boolean {
  return /\.(ico|png|jpg|jpeg|gif|webp|svg|txt|xml|woff2?|ttf|eot)$/i.test(pathname);
}

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function middleware(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout")
  ) {
    return NextResponse.next();
  }

  // Diagnostic endpoint: allow without session.
  if (pathname.startsWith("/api/version")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session = token ? await decodeSessionToken(token) : null;
  let effectiveStatus: string = "skip";
  let effectiveHttp: number | null = null;
  let effectiveErr: string | null = null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "未授權，請先登入" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    // Next.js 內部的 RSC 請求會帶 ?_rsc=...；把它放進 next 會造成 /login 與 / 的內部請求互跳。
    const nextUrl = request.nextUrl.clone();
    nextUrl.searchParams.delete("_rsc");
    loginUrl.searchParams.set("next", pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 避免 middleware 內 fetch effective 時遞迴；此路徑僅依 route handler 驗證 session。
  if (pathname.startsWith("/api/role-permissions/effective")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth/me")) {
    return NextResponse.next();
  }

  // Edge runtime 不能直接用 Prisma；為了「儲存後立刻生效」，所有角色都走即時有效權限 API（5 秒快取）。
  if (session) {
    const role = session.role;
    const cacheKey = `${role}:${session.userId}`;
    const cached = effectivePermsCache.get(cacheKey);
    const now = Date.now();

    if (!cached || cached.expiresAt <= now) {
      effectiveStatus = "miss_fail";
      try {
        const cookieHeader = buildCookieHeader(request);
        const host = request.headers.get("host") ?? "";

        const candidates: string[] = [];
        const internal = getInternalOrigin(request);
        if (internal) candidates.push(new URL("/api/role-permissions/effective", internal).toString());
        candidates.push(new URL("/api/role-permissions/effective", request.url).toString());

        let res: Response | null = null;
        let lastErr: unknown = null;

        for (const u of candidates) {
          try {
            res = await fetch(u, {
              redirect: "manual",
              headers: {
                accept: "application/json",
                cookie: cookieHeader,
                ...(host ? { host } : {}),
              },
            });
            break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (!res) {
          throw lastErr ?? new Error("fetch_failed_no_response");
        }
        effectiveHttp = res.status;
        if (res.ok) {
          const data = await res.json();
          effectivePermsCache.set(cacheKey, {
            expiresAt: now + PERMISSIONS_CACHE_TTL_MS,
            data,
          });
          effectiveStatus = "miss_ok";
        } else {
          effectiveStatus = `miss_http_${res.status}`;
        }
      } catch (e) {
        // 失敗就用 token 裡的舊值（至少不會破壞登入流程）
        if (e instanceof Error) {
          effectiveErr = e.message ? `${e.name}:${e.message}` : e.name;
        } else {
          effectiveErr = "unknown";
        }
      }
    } else {
      effectiveStatus = "hit";
    }

    const fresh = effectivePermsCache.get(cacheKey)?.data;
    if (fresh && Array.isArray(fresh.allowedPagePathPatterns)) {
      session = {
        ...session,
        allowedPagePathPatterns: fresh.allowedPagePathPatterns,
        allowedApiReadPatterns: Array.isArray(fresh.allowedApiReadPatterns)
          ? fresh.allowedApiReadPatterns
          : session.allowedApiReadPatterns,
        allowedApiWritePatterns: Array.isArray(fresh.allowedApiWritePatterns)
          ? fresh.allowedApiWritePatterns
          : session.allowedApiWritePatterns,
      };
    }
  }

  const effectiveFailed = typeof effectiveStatus === "string" && effectiveStatus.startsWith("miss");
  const hasPatterns =
    !!session &&
    Array.isArray(session.allowedPagePathPatterns) &&
    session.allowedPagePathPatterns.length > 0;

  // 安全降級：若 effective 權限抓取失敗，避免管理員被鎖在外面（僅 ADMIN，且僅在 patterns 為空時）。
  const bypassForAdmin =
    !!session && session.role === "ADMIN" && effectiveFailed && !hasPatterns;

  const res = pathname.startsWith("/api")
    ? (() => {
        if (!bypassForAdmin && !canAccessApi(session, pathname, request.method)) {
          return NextResponse.json({ error: "權限不足" }, { status: 403 });
        }
        return NextResponse.next();
      })()
    : (() => {
        if (!bypassForAdmin && !canAccessPage(session, pathname)) {
          return NextResponse.redirect(new URL("/forbidden", request.url));
        }
        return NextResponse.next();
      })();

  // Debug headers (不含敏感資料): 用來確認 middleware 是否拿到有效權限。
  if (session) {
    res.headers.set("x-dps-role", String(session.role));
    res.headers.set("x-dps-effective", effectiveStatus);
    if (effectiveHttp != null) res.headers.set("x-dps-effective-http", String(effectiveHttp));
    if (effectiveErr) res.headers.set("x-dps-effective-err", effectiveErr);
    if (bypassForAdmin) res.headers.set("x-dps-bypass", "admin_effective_failed");
    res.headers.set(
      "x-dps-pages",
      String(Array.isArray(session.allowedPagePathPatterns) ? session.allowedPagePathPatterns.length : 0)
    );
    res.headers.set(
      "x-dps-api-r",
      String(Array.isArray(session.allowedApiReadPatterns) ? session.allowedApiReadPatterns.length : 0)
    );
    res.headers.set(
      "x-dps-api-w",
      String(Array.isArray(session.allowedApiWritePatterns) ? session.allowedApiWritePatterns.length : 0)
    );
  } else {
    res.headers.set("x-dps-role", "none");
    res.headers.set("x-dps-effective", effectiveStatus);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
