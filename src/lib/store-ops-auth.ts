import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/api-access";
import { isAuthEnabled } from "@/lib/auth-config";
import { getAuthContext, type AuthContext } from "@/lib/auth-context";
import { getSessionFromRequest } from "@/lib/auth-request";
import { ROLE_KEYS, type RoleKey } from "@/lib/roles";

const DEV_AUTH: AuthContext = {
  userId: "__dev__",
  username: "dev",
  roleKey: ROLE_KEYS.ADMIN,
  allowedStoreIds: null,
};

export type StoreOpsAuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

export async function requireStoreOps(req: NextRequest): Promise<StoreOpsAuthResult> {
  const session = await getSessionFromRequest(req);
  if (!isAuthEnabled()) {
    return { ok: true, ctx: DEV_AUTH };
  }
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "未登入" }, { status: 401 }) };
  }
  const denied = await requireApiAccess(session, req);
  if (denied) return { ok: false, response: denied };
  const ctx = await getAuthContext(session.userId);
  return { ok: true, ctx };
}

export function canAccessStore(ctx: AuthContext, storeId: string): boolean {
  if (ctx.allowedStoreIds === null) return true;
  return ctx.allowedStoreIds.includes(storeId);
}

export function assertStoreAccess(ctx: AuthContext, storeId: string): NextResponse | null {
  if (!canAccessStore(ctx, storeId)) {
    return NextResponse.json({ error: "無權限存取此門市" }, { status: 403 });
  }
  return null;
}

export function assertRoles(ctx: AuthContext, ...roles: RoleKey[]): NextResponse | null {
  if (!roles.includes(ctx.roleKey)) {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }
  return null;
}

/** 依角色決定查詢用的 storeId 條件 */
export function buildStoreScopeWhere(
  ctx: AuthContext,
  requestedStoreId?: string | null
): { storeId: string } | { storeId: { in: string[] } } | Record<string, never> {
  if (ctx.allowedStoreIds === null) {
    const id = requestedStoreId?.trim();
    return id ? { storeId: id } : {};
  }
  if (ctx.allowedStoreIds.length === 0) {
    return { storeId: "__no_access__" };
  }
  if (ctx.allowedStoreIds.length === 1) {
    return { storeId: ctx.allowedStoreIds[0] };
  }
  const id = requestedStoreId?.trim();
  if (id && ctx.allowedStoreIds.includes(id)) {
    return { storeId: id };
  }
  return { storeId: { in: ctx.allowedStoreIds } };
}

export function resolveWriteStoreId(
  ctx: AuthContext,
  requestedStoreId: string
): { storeId: string } | { error: NextResponse } {
  const storeId = requestedStoreId.trim();
  if (!storeId) {
    return { error: NextResponse.json({ error: "缺少 storeId" }, { status: 400 }) };
  }
  const denied = assertStoreAccess(ctx, storeId);
  if (denied) return { error: denied };
  return { storeId };
}
