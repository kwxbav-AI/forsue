import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth-session";
import { canAccessApiDb } from "@/lib/permissions-db";

/** Route handler 內依 DB 權限檢查目前請求路徑與 method（與 middleware 一致）。 */
export async function requireApiAccess(
  session: SessionPayload | null,
  req: NextRequest
): Promise<NextResponse | null> {
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const pathname = req.nextUrl.pathname;
  const ok = await canAccessApiDb(session.role, pathname, req.method);
  if (!ok) {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }
  return null;
}
