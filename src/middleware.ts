import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { decodeSessionToken } from "@/lib/auth-session";
import { canAccessApi, canAccessPage } from "@/lib/permissions";
import { isExternalApiPath, validateApiKey } from "@/lib/api-key-auth";

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
  // 優先用請求的 Host（dev 常為 :3000 / :3001，production 為實際網域）。
  const host = request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }
  // Cloud Run 等：fallback 至 process PORT（預設與 next start 一致）
  const port =
    (typeof process !== "undefined" && process.env && (process.env.PORT || process.env.NEXT_PUBLIC_PORT)) ||
    "8080";
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

  // Admin 端點（seed 等寫入工具）：一律以 X-API-Key 驗證，不接受 cookie session。
  //
  // 此處原本無條件放行，註解假設「route handler 自己會驗證金鑰」，但該驗證已於
  // commit 00fccee 從 route handler 移除，兩邊各自以為對方在擋，導致 /api/admin/*
  // 完全未認證即可寫入正式資料庫。改為在此確實驗證。
  //
  // validateApiKey 在未設定 EXTERNAL_API_KEY 時回傳 "disabled"，此處一併視為不通過
  // （預設拒絕），避免再次因為漏設環境變數而整個開放。
  if (pathname.startsWith("/api/admin/")) {
    if (validateApiKey(request) !== "ok") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 外部系統（店務平台）唯讀存取白名單端點：帶了 X-API-Key 就放行到 route handler，
  // 由該 handler 以 validateApiKey 實際驗證金鑰。middleware 這層只負責不要用
  // cookie session 把它擋在外面——否則 route handler 裡的金鑰驗證永遠執行不到，
  // 外部呼叫只會收到「未授權，請先登入」這種與金鑰無關的誤導性訊息。
  //
  // 僅限 GET：外部金鑰不得寫入任何資料。
  if (isExternalApiPath(pathname) && request.headers.get("x-api-key")) {
    if (request.method !== "GET") {
      return NextResponse.json(
        { error: "外部金鑰僅允許 GET 請求" },
        { status: 405 }
      );
    }
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
    const role = session.roleKey;
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
    !!session && session.roleKey === "ADMIN" && effectiveFailed && !hasPatterns;

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
    res.headers.set("x-dps-role", String(session.roleKey));
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
