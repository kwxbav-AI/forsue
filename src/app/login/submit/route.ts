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

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthEnabled()) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const next = safeNextPath(req.nextUrl.searchParams.get("next"));

    const form = await req.formData().catch(() => null);
    const username = (form?.get("username") ?? "").toString();
    const password = (form?.get("password") ?? "").toString();

    const parsed = bodySchema.safeParse({ username, password });
    if (!parsed.success) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
    }

    const user = await prisma.appUser.findUnique({
      where: { username: parsed.data.username.trim() },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
    }

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId ?? user.role?.id ?? String(user.legacyRole),
      roleKey: user.role?.key ?? String(user.legacyRole),
      roleName: user.role?.name ?? undefined,
    });

    const res = NextResponse.redirect(new URL(next, req.url));
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error("[login/submit]", e);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

