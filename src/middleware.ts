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
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await decodeSessionToken(token) : null;
    if (session) {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url));
    }
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

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "未授權，請先登入" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
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
    const cached = effectivePermsCache.get(role);
    const now = Date.now();

    if (!cached || cached.expiresAt <= now) {
      try {
        const url = new URL("/api/role-permissions/effective", request.url);
        const res = await fetch(url.toString(), {
          headers: {
            accept: "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
        });
        const data = await res.json();
        effectivePermsCache.set(role, {
          expiresAt: now + PERMISSIONS_CACHE_TTL_MS,
          data,
        });
      } catch {
        // 失敗就用 token 裡的舊值（至少不會破壞登入流程）
      }
    }

    const fresh = effectivePermsCache.get(role)?.data;
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

  if (pathname.startsWith("/api")) {
    if (!canAccessApi(session, pathname, request.method)) {
      return NextResponse.json({ error: "權限不足" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!canAccessPage(session, pathname)) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
