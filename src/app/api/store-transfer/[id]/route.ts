import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().optional().nullable(),
  allowanceType: z.enum(["management", "staff", "parttime"]).optional(),
  baseMonthlyAmount: z.number().int().positive().optional(),
});

/** PUT /api/store-transfer/[id] — 更新（設定迄日、備註） */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { endDate, ...rest } = parsed.data;
  const record = await prisma.storeTransferRecord.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(record);
}

/** DELETE /api/store-transfer/[id] — 刪除紀錄 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.storeTransferRecord.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
