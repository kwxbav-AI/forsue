import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import {
  assertListQueryScope,
  buildStoreListWhere,
  requireStoreOps,
  resolveWriteStoreId,
} from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const WEATHER_VALUES = ["晴", "陰", "雨", "颱風", "其他"] as const;

const discountItemSchema = z.object({
  productName: z.string().min(1),
  amount: z.number().int(),
  quantity: z.number().int().min(1).optional(),
  note: z.string().optional().nullable(),
});

const postSchema = z.object({
  storeId: z.string().min(1),
  reportDate: z.string(),
  mainWork: z.string().optional().nullable(),
  anomaly: z.string().optional().nullable(),
  revenue: z.number().int().optional().nullable(),
  weather: z.enum(WEATHER_VALUES).optional().nullable(),
  handoverNote: z.string().optional().nullable(),
  feedback: z.string().optional().nullable(),
  restockDone: z.boolean().optional(),
  expiryDone: z.boolean().optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
  discountItems: z.array(discountItemSchema).optional(),
});

const journalInclude = {
  store: { select: { storeName: true, region: true } },
  discountItems: { orderBy: { createdAt: "asc" as const } },
};

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const date = req.nextUrl.searchParams.get("date")?.trim();
  const month = req.nextUrl.searchParams.get("month")?.trim();
  const storeId = req.nextUrl.searchParams.get("storeId");
  const region = req.nextUrl.searchParams.get("region");
  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 格式須為 YYYY-MM" }, { status: 400 });
  }

  const dateWhere =
    date ?
      { reportDate: parseDateOnlyUTC(date) }
    : month ?
      (() => {
        const [year, mon] = month.split("-").map(Number);
        const { startYmd, endYmd } = monthStartEndYmd(year, mon);
        return {
          reportDate: {
            gte: parseDateOnlyUTC(startYmd),
            lte: parseDateOnlyUTC(endYmd),
          },
        };
      })()
    : {};

  const list = await prisma.dailyReport.findMany({
    where: {
      ...buildStoreListWhere(auth.ctx, { storeId, region }),
      ...dateWhere,
    },
    include: journalInclude,
    orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ items: list });
}

export async function POST(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "欄位錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const resolved = resolveWriteStoreId(auth.ctx, parsed.data.storeId);
  if ("error" in resolved) return resolved.error;

  const status = parsed.data.status ?? "DRAFT";
  const now = new Date();
  const reportDate = parseDateOnlyUTC(parsed.data.reportDate);
  const discountItems = parsed.data.discountItems ?? [];

  const reportData = {
    mainWork: parsed.data.mainWork?.trim() || null,
    anomaly: parsed.data.anomaly?.trim() || null,
    revenue: parsed.data.revenue ?? null,
    weather: parsed.data.weather ?? null,
    handoverNote: parsed.data.handoverNote?.trim() || null,
    feedback: parsed.data.feedback?.trim() || null,
    restockDone: parsed.data.restockDone ?? false,
    expiryDone: parsed.data.expiryDone ?? false,
    status,
    ...(status === "SUBMITTED" ?
      { submittedAt: now, submittedBy: auth.ctx.username }
    : {}),
  };

  const row = await prisma.$transaction(async (tx) => {
    const report = await tx.dailyReport.upsert({
      where: {
        storeId_reportDate: {
          storeId: resolved.storeId,
          reportDate,
        },
      },
      create: {
        storeId: resolved.storeId,
        reportDate,
        ...reportData,
      },
      update: reportData,
    });

    await tx.discountItem.deleteMany({ where: { dailyReportId: report.id } });
    if (discountItems.length > 0) {
      await tx.discountItem.createMany({
        data: discountItems.map((item) => ({
          dailyReportId: report.id,
          productName: item.productName.trim(),
          amount: item.amount,
          quantity: item.quantity ?? 1,
          note: item.note?.trim() || null,
        })),
      });
    }

    return tx.dailyReport.findUniqueOrThrow({
      where: { id: report.id },
      include: journalInclude,
    });
  });

  return NextResponse.json(row, { status: 201 });
}
