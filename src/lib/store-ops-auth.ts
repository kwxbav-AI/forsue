import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/api-access";
import { isAuthEnabled } from "@/lib/auth-config";
import { getAuthContext, type AuthContext } from "@/lib/auth-context";
import { getServerSession } from "@/lib/auth-server";
import { ROLE_KEYS, type RoleKey } from "@/lib/roles";

/** 允許 GET 列表不帶 storeId（全區／轄區多店）的角色 */
const REGIONAL_LIST_ROLES: RoleKey[] = [
  ROLE_KEYS.ADMIN,
  ROLE_KEYS.SUPERVISOR,
  ROLE_KEYS.LOGISTICS,
  ROLE_KEYS.PURCHASE,
];

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
  if (!isAuthEnabled()) {
    return { ok: true, ctx: DEV_AUTH };
  }
  const session = await getServerSession();
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

/**
 * GET 列表查詢範圍驗證：
 * - 有帶 storeId：必須在 allowedStoreIds 內
 * - 不帶 storeId：門市人員僅能看自己門市；督導以上才可全區／轄區查詢
 */
export function assertListQueryScope(
  ctx: AuthContext,
  requestedStoreId?: string | null
): NextResponse | null {
  const id = requestedStoreId?.trim();
  if (id) {
    return assertStoreAccess(ctx, id);
  }
  if (ctx.roleKey === ROLE_KEYS.STORE_STAFF) {
    if (!ctx.allowedStoreIds?.length) {
      return NextResponse.json({ error: "尚未綁定門市" }, { status: 403 });
    }
    return null;
  }
  if (!REGIONAL_LIST_ROLES.includes(ctx.roleKey)) {
    return NextResponse.json({ error: "無權限進行全區查詢" }, { status: 403 });
  }
  return null;
}

const STORE_OPS_LIST_REGIONS = new Set(["桃園區", "宜蘭區"]);

/** 列表查詢：storeId 或 region（桃園區／宜蘭區） */
export function buildStoreListWhere(
  ctx: AuthContext,
  opts: { storeId?: string | null; region?: string | null }
): Record<string, unknown> {
  const region = opts.region?.trim();
  const storeId = opts.storeId?.trim();
  const scope = buildStoreScopeWhere(ctx, storeId || null);
  if (region) {
    if (!STORE_OPS_LIST_REGIONS.has(region)) {
      return { storeId: "__invalid_region__" };
    }
    return { ...scope, store: { region } };
  }
  return scope;
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
  if (id) {
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
