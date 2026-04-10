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
        const url = new URL("/api/role-permissions/effective", request.url);
        const res = await fetch(url.toString(), {
          headers: {
            accept: "application/json",
            cookie: buildCookieHeader(request),
          },
        });
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
        effectiveErr = e instanceof Error ? e.name : "unknown";
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

  const res = pathname.startsWith("/api")
    ? (() => {
    if (!canAccessApi(session, pathname, request.method)) {
      return NextResponse.json({ error: "權限不足" }, { status: 403 });
    }
    return NextResponse.next();
      })()
    : (() => {
    if (!canAccessPage(session, pathname)) {
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
