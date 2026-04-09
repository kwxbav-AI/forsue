import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";

/** 僅回傳「目前登入者」角色的有效權限（不可查詢其他角色）。 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const role = session.role;
  const rolePerms = await prisma.rolePermission.findMany({
    where: { role },
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
  const allowedApiReadMap = new Map<
    string,
    { pathPattern: string; method: string | null }
  >();
  const allowedApiWriteMap = new Map<
    string,
    { pathPattern: string; method: string | null }
  >();

  for (const rp of rolePerms) {
    const canReadEffective = rp.canRead || rp.canWrite;
    const canWriteEffective = rp.canWrite;

    for (const pattern of rp.module.patterns) {
      if (pattern.kind === "PAGE") {
        if (canReadEffective) allowedPagePathPatterns.add(pattern.pathPattern);
        continue;
      }

      const methodNormalized =
        pattern.method && pattern.method.length > 0 ? pattern.method : null;
      const key = `${pattern.pathPattern}::${methodNormalized ?? ""}`;

      if (canReadEffective) {
        allowedApiReadMap.set(key, {
          pathPattern: pattern.pathPattern,
          method: methodNormalized,
        });
      }
      if (canWriteEffective) {
        allowedApiWriteMap.set(key, {
          pathPattern: pattern.pathPattern,
          method: methodNormalized,
        });
      }
    }
  }

  return NextResponse.json({
    role,
    allowedPagePathPatterns: Array.from(allowedPagePathPatterns),
    allowedApiReadPatterns: Array.from(allowedApiReadMap.values()),
    allowedApiWritePatterns: Array.from(allowedApiWriteMap.values()),
  });
}
