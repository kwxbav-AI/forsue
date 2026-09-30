import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().min(1),
  fromStoreId: z.string().min(1),
  toStoreId: z.string().min(1),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  allowanceType: z.enum(["management", "staff", "parttime"]),
  baseMonthlyAmount: z.number().int().positive(),
  notes: z.string().optional().nullable(),
});

/** GET /api/store-transfer — 列出所有調店津貼紀錄 */
export async function GET() {
  const records = await prisma.storeTransferRecord.findMany({
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
    },
    orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(records);
}

/** POST /api/store-transfer — 新增調店津貼紀錄 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { transferDate, endDate, ...rest } = parsed.data;
  const record = await prisma.storeTransferRecord.create({
    data: {
      ...rest,
      transferDate: new Date(transferDate),
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(record, { status: 201 });
}
