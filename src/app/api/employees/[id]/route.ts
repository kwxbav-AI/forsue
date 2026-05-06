import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { parseEffectiveFrom } from "@/lib/reserve-staff-periods";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json().catch(() => ({}));
    const isReserveStaff =
      typeof body.isReserveStaff === "boolean" ? body.isReserveStaff : undefined;
    if (isReserveStaff === undefined) {
      return NextResponse.json(
        { error: "請提供是否為儲備人力" },
        { status: 400 }
      );
    }
    const reserveWorkPercentRaw = body.reserveWorkPercent;
    let effectiveFrom: Date;
    try {
      effectiveFrom = parseEffectiveFrom(body.effectiveFrom);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "請提供生效日期" },
        { status: 400 }
      );
    }

    let reserveWorkPercent: number | null | undefined = undefined;
    if (reserveWorkPercentRaw === null) reserveWorkPercent = null;
    if (typeof reserveWorkPercentRaw === "number") reserveWorkPercent = reserveWorkPercentRaw;
    if (typeof reserveWorkPercentRaw === "string" && reserveWorkPercentRaw.trim() !== "") {
      const v = Number(reserveWorkPercentRaw);
      reserveWorkPercent = Number.isFinite(v) ? v : NaN;
    }

    // reserveWorkPercent 可能是 null（取消儲備人力時會清空），因此只在為數字時做範圍檢查
    if (reserveWorkPercent != null) {
      if (!Number.isFinite(reserveWorkPercent)) {
        return NextResponse.json(
          { error: "工時計算% 必須為數字" },
          { status: 400 }
        );
      }
      if (reserveWorkPercent < 0 || reserveWorkPercent > 100) {
        return NextResponse.json(
          { error: "工時計算% 必須介於 0~100" },
          { status: 400 }
        );
      }
    }
    if (isReserveStaff === true && reserveWorkPercent == null) {
      return NextResponse.json(
        { error: "儲備人力必須填寫工時計算%" },
        { status: 400 }
      );
    }

    const nextIsReserveStaff = isReserveStaff;
    const nextReserveWorkPercent: number | null = nextIsReserveStaff ? reserveWorkPercent! : null;
    const effectiveFromStr = formatDateOnly(effectiveFrom);
    const previousEffectiveTo = parseDateOnlyUTC(addCalendarDaysUTC(effectiveFromStr, -1));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.employeeReserveStaffPeriod.deleteMany({
        where: { employeeId: id, effectiveFrom: { gte: effectiveFrom } },
      });
      await tx.employeeReserveStaffPeriod.updateMany({
        where: {
          employeeId: id,
          effectiveFrom: { lt: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        data: { effectiveTo: previousEffectiveTo },
      });
      await tx.employeeReserveStaffPeriod.create({
        data: {
          employeeId: id,
          effectiveFrom,
          isReserveStaff: nextIsReserveStaff,
          reserveWorkPercent: nextReserveWorkPercent,
        },
      });
      return tx.employee.update({
        where: { id },
        data: {
          isReserveStaff: nextIsReserveStaff,
          reserveWorkPercent: nextReserveWorkPercent,
        },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          isReserveStaff: true,
          reserveWorkPercent: true,
        },
      });
    });

    return NextResponse.json({
      ...updated,
      effectiveFrom: effectiveFromStr,
      reserveWorkPercent:
        updated.reserveWorkPercent == null ? null : Number(updated.reserveWorkPercent),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失敗" },
      { status: 500 }
    );
  }
}

