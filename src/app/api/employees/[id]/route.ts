import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { parseEffectiveFrom } from "@/lib/reserve-staff-periods";

export const dynamic = "force-dynamic";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json().catch(() => ({}));

    // 所屬門市／到職日／離職日：一般欄位，不做期間追蹤，直接覆蓋
    const plainUpdateData: { defaultStoreId?: string | null; hireDate?: Date | null; leaveDate?: Date | null } = {};
    if (Object.prototype.hasOwnProperty.call(body, "defaultStoreId")) {
      const v = body.defaultStoreId;
      plainUpdateData.defaultStoreId = typeof v === "string" && v.trim() !== "" ? v : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "hireDate")) {
      const v = body.hireDate;
      if (v === null || v === "") {
        plainUpdateData.hireDate = null;
      } else if (typeof v === "string" && DATE_ONLY_RE.test(v)) {
        plainUpdateData.hireDate = parseDateOnlyUTC(v);
      } else {
        return NextResponse.json({ error: "到職日格式錯誤（需 YYYY-MM-DD）" }, { status: 400 });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "leaveDate")) {
      const v = body.leaveDate;
      if (v === null || v === "") {
        plainUpdateData.leaveDate = null;
      } else if (typeof v === "string" && DATE_ONLY_RE.test(v)) {
        plainUpdateData.leaveDate = parseDateOnlyUTC(v);
      } else {
        return NextResponse.json({ error: "離職日格式錯誤（需 YYYY-MM-DD）" }, { status: 400 });
      }
    }

    const isReserveStaff =
      typeof body.isReserveStaff === "boolean" ? body.isReserveStaff : undefined;

    if (isReserveStaff === undefined) {
      // 未提供儲備人力設定：僅更新所屬門市／到職日等一般欄位
      if (Object.keys(plainUpdateData).length === 0) {
        return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
      }
      const updated = await prisma.employee.update({
        where: { id },
        data: plainUpdateData,
        select: {
          id: true,
          employeeCode: true,
          name: true,
          defaultStoreId: true,
          hireDate: true,
          leaveDate: true,
          isReserveStaff: true,
          reserveWorkPercent: true,
        },
      });
      return NextResponse.json({
        ...updated,
        hireDate: updated.hireDate ? formatDateOnly(updated.hireDate) : null,
        leaveDate: updated.leaveDate ? formatDateOnly(updated.leaveDate) : null,
        reserveWorkPercent:
          updated.reserveWorkPercent == null ? null : Number(updated.reserveWorkPercent),
      });
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
          ...plainUpdateData,
        },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          defaultStoreId: true,
          hireDate: true,
          leaveDate: true,
          isReserveStaff: true,
          reserveWorkPercent: true,
        },
      });
    });

    return NextResponse.json({
      ...updated,
      effectiveFrom: effectiveFromStr,
      hireDate: updated.hireDate ? formatDateOnly(updated.hireDate) : null,
      leaveDate: updated.leaveDate ? formatDateOnly(updated.leaveDate) : null,
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

