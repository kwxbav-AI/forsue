import { cookies } from "next/headers";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { decodeSessionToken, type SessionPayload } from "@/lib/auth-session";

/** 未啟用 AUTH_SECRET 時的開發用 session（與 seed ADMIN 角色 id 一致）。 */
const DEV_SESSION: SessionPayload = {
  userId: "__dev__",
  username: "dev",
  roleId: "ADMIN",
  roleKey: "ADMIN",
  roleName: "開發模式",
};

export async function getServerSession(): Promise<SessionPayload | null> {
  if (!isAuthEnabled()) {
    return DEV_SESSION;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSessionToken(token);
}
