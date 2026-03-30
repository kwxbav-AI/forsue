import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-request";
import { USER_ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      username: session.username,
      role: session.role,
      roleLabel: USER_ROLE_LABELS[session.role],
    },
  });
}
