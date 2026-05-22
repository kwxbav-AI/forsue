import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { serializeRetailStore } from "@/lib/operations-serialize";
import { normalizeRetailBusinessHours } from "@/lib/retail-store-hours";

export const dynamic = "force-dynamic";

const optionalHours = z
  .union([z.number().nonnegative(), z.null()])
  .optional();

const bodySchema = z.object({
  storeName: z.string().min(1),
  region: z.string().optional().nullable(),
  managerName: z.string().optional().nullable(),
  dailyBusinessHours: optionalHours,
  weekdayBusinessHours: optionalHours,
  saturdayBusinessHours: optionalHours,
  defaultLaborHoursPerDay: optionalHours,
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "1";
  const list = await prisma.retailStore.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ region: "asc" }, { storeName: "asc" }],
  });
  return NextResponse.json(list.map(serializeRetailStore));
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
    const {
      storeName,
      region,
      managerName,
      dailyBusinessHours,
      weekdayBusinessHours,
      saturdayBusinessHours,
      defaultLaborHoursPerDay,
      isActive,
    } = parsed.data;
    const bizHours = normalizeRetailBusinessHours({
      dailyBusinessHours,
      weekdayBusinessHours,
      saturdayBusinessHours,
    });
    const created = await prisma.retailStore.create({
      data: {
        storeName: storeName.trim(),
        region: region?.trim() || null,
        managerName: managerName?.trim() || null,
        ...bizHours,
        defaultLaborHoursPerDay: defaultLaborHoursPerDay ?? null,
        isActive: isActive ?? true,
      },
    });
    return NextResponse.json(serializeRetailStore(created), { status: 201 });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "新增門市失敗";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "門市名稱已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
