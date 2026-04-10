import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const gitSha = process.env.GIT_SHA ?? null;
  const buildTime = process.env.BUILD_TIME ?? null;
  const vercelGitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const authSecretLen = typeof process.env.AUTH_SECRET === "string" ? process.env.AUTH_SECRET.length : 0;

  return NextResponse.json({
    gitSha,
    vercelGitSha,
    buildTime,
    authEnabled: authSecretLen >= 16,
    authSecretLen,
  });
}

