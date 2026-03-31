import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { createSessionToken } from "@/lib/auth-session";
import { verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    if (!isAuthEnabled()) {
      return NextResponse.json(
        { error: "未啟用登入（請設定 AUTH_SECRET，至少 16 字元）" },
        { status: 400 }
      );
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "請輸入帳號與密碼" }, { status: 400 });
    }

    const { username, password } = parsed.data;
    const user = await prisma.appUser.findUnique({
      where: { username: username.trim() },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { error: "登入處理失敗（資料庫或設定異常），請洽管理員。" },
      { status: 500 }
    );
  }
}
