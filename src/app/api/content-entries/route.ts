import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, endOfDayUTC } from "@/lib/date";
import { totalDeductedMinutes } from "@/lib/content-deduction";
import { z } from "zod";

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

  const where: { workDate?: { gte: Date; lte: Date } } = {};
  if (startDate && endDate) {
    where.workDate = {
      gte: parseDateOnlyUTC(startDate),
      lte: endOfDayUTC(endDate),
    };
  } else if (startDate) {
    where.workDate = { gte: parseDateOnlyUTC(startDate), lte: endOfDayUTC(startDate) };
  }

  const list = await prisma.contentEntry.findMany({
    where,
    orderBy: [{ workDate: "desc" }, { branch: "asc" }],
  });
  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  try {
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
      },
    });
    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 }
    );
  }
}
