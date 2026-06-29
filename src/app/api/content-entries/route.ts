import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { totalDeductedMinutes } from "@/lib/content-deduction";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";
import {
  creatorDisplayName,
  formatFilledAtTaipei,
  resolveCreatorNamesByCode,
} from "@/lib/record-creator-meta";

export const dynamic = "force-dynamic";

const DEDUCT_VIS_MODULE_KEY = "content-entries-deduct";

async function canSeeDeductedMinutes(req: NextRequest): Promise<boolean> {
  const session = await getSessionFromRequest(req);
  if (!session) return false;
  // 有綁定門市的帳號（門市人員）預設可見扣工時
  const hasStore = await prisma.appUser.count({
    where: { id: session.userId, retailStoreId: { not: null } },
  });
  if (hasStore > 0) return true;
  return hasModuleEffectivePermission(
    { id: session.roleId, key: session.roleKey },
    DEDUCT_VIS_MODULE_KEY,
    "read"
  );
}

function maskDeductedMinutes<T extends Record<string, any>>(row: T): Omit<T, "deductedMinutes"> | T {
  const { deductedMinutes, ...rest } = row;
  return rest as any;
}

const bodySchema = z.object({
  workDate: z.string(),
  branch: z.string(),
  totalArticles: z.number().int().min(0).optional().nullable(),
  contentDesc1: z.string().optional().nullable(),
  articleUrl1: z.string().optional().nullable(),
  productCount1: z.number().int().min(0).optional().nullable(),
  commentCount1: z.number().int().min(0).optional().nullable(),
  contentDesc2: z.string().optional().nullable(),
  articleUrl2: z.string().optional().nullable(),
  productCount2: z.number().int().min(0).optional().nullable(),
  commentCount2: z.number().int().min(0).optional().nullable(),
  contentDesc3: z.string().optional().nullable(),
  articleUrl3: z.string().optional().nullable(),
  productCount3: z.number().int().min(0).optional().nullable(),
  commentCount3: z.number().int().min(0).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const latest = searchParams.get("latest");
  const takeParam = searchParams.get("take");

  const branchFilter = searchParams.get("branch");
  const where: { workDate?: { gte: Date; lte: Date }; branch?: { contains: string; mode: "insensitive" } } = {};
  if (startDate && endDate) {
    where.workDate = {
      gte: parseDateOnlyUTC(startDate),
      lte: parseDateOnlyUTC(endDate),
    };
  } else if (startDate) {
    const d = parseDateOnlyUTC(startDate);
    where.workDate = { gte: d, lte: d };
  }
  if (branchFilter) where.branch = { contains: branchFilter, mode: "insensitive" };

  const isLatestMode = !where.workDate && latest === "1";
  const takeRequested = takeParam ? parseInt(takeParam, 10) : NaN;
  const take =
    Number.isFinite(takeRequested) && takeRequested > 0
      ? Math.min(500, Math.max(1, takeRequested))
      : isLatestMode
        ? 50
        : undefined;

  const list = await prisma.contentEntry.findMany({
    where,
    orderBy: [{ workDate: "desc" }, { branch: "asc" }],
    ...(take ? { take } : {}),
  });
  const creatorCodes = list.map((r) => r.createdBy?.trim()).filter(Boolean) as string[];
  const nameByCode = await resolveCreatorNamesByCode(creatorCodes);
  const canSee = await canSeeDeductedMinutes(request);
  const payload = list.map((r) => {
    const base = canSee ? r : maskDeductedMinutes(r);
    return {
      ...base,
      createdByCode: r.createdBy?.trim() || null,
      createdByName: creatorDisplayName(r.createdBy, nameByCode),
      filledAt: formatFilledAtTaipei(r.createdAt),
    };
  });
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parseDateOnlyUTC(parsed.data.workDate);
    const p1 = parsed.data.productCount1 ?? 0;
    const c1 = parsed.data.commentCount1 ?? 0;
    const p2 = parsed.data.productCount2 ?? 0;
    const c2 = parsed.data.commentCount2 ?? 0;
    const p3 = parsed.data.productCount3 ?? 0;
    const c3 = parsed.data.commentCount3 ?? 0;
    const deductedMinutes = totalDeductedMinutes(p1, c1, p2, c2, p3, c3);

    const created = await prisma.contentEntry.create({
      data: {
        workDate: d,
        branch: parsed.data.branch.trim(),
        totalArticles: parsed.data.totalArticles ?? null,
        contentDesc1: parsed.data.contentDesc1?.trim() || null,
        articleUrl1: parsed.data.articleUrl1?.trim() || null,
        productCount1: parsed.data.productCount1 ?? null,
        commentCount1: parsed.data.commentCount1 ?? null,
        contentDesc2: parsed.data.contentDesc2?.trim() || null,
        articleUrl2: parsed.data.articleUrl2?.trim() || null,
        productCount2: parsed.data.productCount2 ?? null,
        commentCount2: parsed.data.commentCount2 ?? null,
        contentDesc3: parsed.data.contentDesc3?.trim() || null,
        articleUrl3: parsed.data.articleUrl3?.trim() || null,
        productCount3: parsed.data.productCount3 ?? null,
        commentCount3: parsed.data.commentCount3 ?? null,
        deductedMinutes,
        createdBy: session?.username?.trim() || null,
      },
    });
    const canSee = await canSeeDeductedMinutes(request);
    const nameByCode = await resolveCreatorNamesByCode(
      created.createdBy ? [created.createdBy] : []
    );
    const row = {
      ...(canSee ? created : maskDeductedMinutes(created)),
      createdByCode: created.createdBy?.trim() || null,
      createdByName: creatorDisplayName(created.createdBy, nameByCode),
      filledAt: formatFilledAtTaipei(created.createdAt),
    };
    return NextResponse.json(row);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 }
    );
  }
}
