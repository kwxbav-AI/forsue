import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const roleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER", "STORE_STAFF"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleParam = searchParams.get("role") ?? "";
  const parsed = roleSchema.safeParse(roleParam);
  if (!parsed.success) {
    return NextResponse.json({ error: "角色參數錯誤" }, { status: 400 });
  }

  const role = parsed.data;
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

