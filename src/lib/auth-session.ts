import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET 長度至少 16 字元");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  userId: string;
  username: string;
  roleId: string;
  roleKey: string;
  roleName?: string;
  // 注意：不可把大量 patterns 放進 cookie（可能超過 4096 bytes 上限）。
  // patterns 由 middleware 透過 effective API 取得並暫存於 request 生命週期中。
  allowedPagePathPatterns?: string[];
  allowedApiReadPatterns?: { pathPattern: string; method: string | null }[];
  allowedApiWritePatterns?: { pathPattern: string; method: string | null }[];
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    roleId: payload.roleId,
    roleKey: payload.roleKey,
    roleName: payload.roleName ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function decodeSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const username = typeof payload.username === "string" ? payload.username : null;
    const roleId = typeof (payload as any).roleId === "string" ? String((payload as any).roleId) : null;
    const roleKey = typeof (payload as any).roleKey === "string" ? String((payload as any).roleKey) : null;
    const roleNameRaw = (payload as any).roleName;
    const roleName = typeof roleNameRaw === "string" ? roleNameRaw : undefined;
    const allowedPagePathPatterns =
      Array.isArray(payload.allowedPagePathPatterns) && payload.allowedPagePathPatterns.every((x) => typeof x === "string")
        ? (payload.allowedPagePathPatterns as string[])
        : [];
    const allowedApiReadPatternsRaw = payload.allowedApiReadPatterns;
    const allowedApiWritePatternsRaw = payload.allowedApiWritePatterns;

    const allowedApiReadPatterns =
      Array.isArray(allowedApiReadPatternsRaw) && allowedApiReadPatternsRaw.every((x) => typeof x === "object" && x && "pathPattern" in x)
        ? (allowedApiReadPatternsRaw as unknown[]).map((x) => ({
            pathPattern: typeof (x as any).pathPattern === "string" ? (x as any).pathPattern : "",
            method:
              (x as any).method === null || typeof (x as any).method === "string"
                ? (x as any).method
                : null,
          })).filter((p) => p.pathPattern)
        : [];

    const allowedApiWritePatterns =
      Array.isArray(allowedApiWritePatternsRaw) && allowedApiWritePatternsRaw.every((x) => typeof x === "object" && x && "pathPattern" in x)
        ? (allowedApiWritePatternsRaw as unknown[]).map((x) => ({
            pathPattern: typeof (x as any).pathPattern === "string" ? (x as any).pathPattern : "",
            method:
              (x as any).method === null || typeof (x as any).method === "string"
                ? (x as any).method
                : null,
          })).filter((p) => p.pathPattern)
        : [];

    if (!userId || !username || !roleId || !roleKey) return null;
    return {
      userId,
      username,
      roleId,
      roleKey,
      roleName,
      allowedPagePathPatterns,
      allowedApiReadPatterns,
      allowedApiWritePatterns,
    };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const p = await decodeSessionToken(token);
  return p !== null;
}
