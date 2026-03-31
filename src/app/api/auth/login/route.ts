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

  // 在登入時把「本角色允許的頁面/API 模式」寫入 token payload，
  // 讓 middleware（Edge runtime）可以不查 DB 直接做權限判斷。
  const rolePerms = await prisma.rolePermission.findMany({
    where: { role: user.role },
    include: {
      module: {
        select: {
          patterns: {
            select: { kind: true, pathPattern: true, method: true },
          },
        },
      },
    },
  });

  const allowedPagePathPatterns = new Set<string>();
  const allowedApiReadPatterns = new Map<string, { pathPattern: string; method: string | null }>();
  const allowedApiWritePatterns = new Map<string, { pathPattern: string; method: string | null }>();

  for (const rp of rolePerms) {
    const canReadEffective = rp.canRead || rp.canWrite;
    const canWriteEffective = rp.canWrite;

    for (const pattern of rp.module.patterns) {
      if (pattern.kind === "PAGE") {
        if (canReadEffective) allowedPagePathPatterns.add(pattern.pathPattern);
        continue;
      }

      // API
      const methodNormalized = pattern.method && pattern.method.length > 0 ? pattern.method : null;
      const key = `${pattern.pathPattern}::${methodNormalized ?? ""}`;

      if (canReadEffective) {
        allowedApiReadPatterns.set(key, { pathPattern: pattern.pathPattern, method: methodNormalized });
      }
      if (canWriteEffective) {
        allowedApiWritePatterns.set(key, { pathPattern: pattern.pathPattern, method: methodNormalized });
      }
    }
  }

  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    allowedPagePathPatterns: Array.from(allowedPagePathPatterns),
    allowedApiReadPatterns: Array.from(allowedApiReadPatterns.values()),
    allowedApiWritePatterns: Array.from(allowedApiWritePatterns.values()),
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
}
