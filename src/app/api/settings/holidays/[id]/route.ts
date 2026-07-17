import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json();
    const { date, name } = body as { date?: string; name?: string };
    await prisma.holiday.update({
      where: { id },
      data: {
        ...(date ? { date: parseDateOnlyUTC(date) } : {}),
        ...(name !== undefined ? { name: name || "假日" } : {}),
      },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新假日失敗" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    await prisma.holiday.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除假日失敗" },
      { status: 500 }
    );
  }
}

