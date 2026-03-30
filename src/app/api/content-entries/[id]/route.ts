import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { totalDeductedMinutes } from "@/lib/content-deduction";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  workDate: z.string().optional(),
  branch: z.string().optional(),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const existing = await prisma.contentEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "找不到該筆資料" }, { status: 404 });
    }

    const p1 = parsed.data.productCount1 ?? existing.productCount1 ?? 0;
    const c1 = parsed.data.commentCount1 ?? existing.commentCount1 ?? 0;
    const p2 = parsed.data.productCount2 ?? existing.productCount2 ?? 0;
    const c2 = parsed.data.commentCount2 ?? existing.commentCount2 ?? 0;
    const p3 = parsed.data.productCount3 ?? existing.productCount3 ?? 0;
    const c3 = parsed.data.commentCount3 ?? existing.commentCount3 ?? 0;
    const deductedMinutes = totalDeductedMinutes(p1, c1, p2, c2, p3, c3);

    const updated = await prisma.contentEntry.update({
      where: { id },
      data: {
        ...(parsed.data.workDate && { workDate: parseDateOnlyUTC(parsed.data.workDate) }),
        ...(parsed.data.branch !== undefined && { branch: parsed.data.branch.trim() }),
        ...(parsed.data.totalArticles !== undefined && { totalArticles: parsed.data.totalArticles }),
        ...(parsed.data.contentDesc1 !== undefined && { contentDesc1: parsed.data.contentDesc1?.trim() || null }),
        ...(parsed.data.articleUrl1 !== undefined && { articleUrl1: parsed.data.articleUrl1?.trim() || null }),
        ...(parsed.data.productCount1 !== undefined && { productCount1: parsed.data.productCount1 }),
        ...(parsed.data.commentCount1 !== undefined && { commentCount1: parsed.data.commentCount1 }),
        ...(parsed.data.contentDesc2 !== undefined && { contentDesc2: parsed.data.contentDesc2?.trim() || null }),
        ...(parsed.data.articleUrl2 !== undefined && { articleUrl2: parsed.data.articleUrl2?.trim() || null }),
        ...(parsed.data.productCount2 !== undefined && { productCount2: parsed.data.productCount2 }),
        ...(parsed.data.commentCount2 !== undefined && { commentCount2: parsed.data.commentCount2 }),
        ...(parsed.data.contentDesc3 !== undefined && { contentDesc3: parsed.data.contentDesc3?.trim() || null }),
        ...(parsed.data.articleUrl3 !== undefined && { articleUrl3: parsed.data.articleUrl3?.trim() || null }),
        ...(parsed.data.productCount3 !== undefined && { productCount3: parsed.data.productCount3 }),
        ...(parsed.data.commentCount3 !== undefined && { commentCount3: parsed.data.commentCount3 }),
        deductedMinutes,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失敗" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    await prisma.contentEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}
