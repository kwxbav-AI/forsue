import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const reserveWorkPercentRaw = body.reserveWorkPercent;

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

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(isReserveStaff !== undefined ? { isReserveStaff } : {}),
        ...(reserveWorkPercent !== undefined
          ? { reserveWorkPercent: reserveWorkPercent }
          : {}),
        // 若取消儲備人力，比例一併清空，避免誤用
        ...(isReserveStaff === false ? { reserveWorkPercent: null } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        isReserveStaff: true,
        reserveWorkPercent: true,
      },
    });

    return NextResponse.json({
      ...updated,
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

