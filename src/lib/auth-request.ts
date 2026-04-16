import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { decodeSessionToken, type SessionPayload } from "@/lib/auth-session";

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSessionToken(token);
}
