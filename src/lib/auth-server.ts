import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { decodeSessionToken, type SessionPayload } from "@/lib/auth-session";

export async function getServerSession(): Promise<SessionPayload | null> {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) {
    return null;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSessionToken(token);
}
