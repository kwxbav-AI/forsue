import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { employeeId: string } }
) {
  const { employeeId } = params;
  const body = await request.json();

  const { currentGrade, targetGrade, hoursRequired, hoursCarryOver, carryOverDate, homeStoreId, note } = body;

  const updateData: Record<string, unknown> = {};
  if (currentGrade !== undefined) updateData.currentGrade = currentGrade;
  if (targetGrade !== undefined) updateData.targetGrade = targetGrade || null;
  if (hoursRequired !== undefined) updateData.hoursRequired = hoursRequired !== "" && hoursRequired !== null ? Number(hoursRequired) : null;
  if (hoursCarryOver !== undefined) updateData.hoursCarryOver = Number(hoursCarryOver);
  if (carryOverDate !== undefined) updateData.carryOverDate = new Date(carryOverDate);
  if (homeStoreId !== undefined) updateData.homeStoreId = homeStoreId || null;
  if (note !== undefined) updateData.note = note || null;

  try {
    await prisma.employeePromotionTracking.update({ where: { employeeId }, data: updateData });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "更新失敗" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { employeeId: string } }
) {
  const { employeeId } = params;
  try {
    await prisma.employeePromotionTracking.delete({ where: { employeeId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "刪除失敗" }, { status: 400 });
  }
}
