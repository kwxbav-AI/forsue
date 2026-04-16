import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";
import { z } from "zod";

export const dynamic = "force-dynamic";

const KEY = "attendance.location.excludedDepartments";

const putSchema = z.object({
  excludedDepartments: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const denied = await requireApiAccess(session, request);
  if (denied) return denied;

  const row = await prisma.appSetting.findUnique({
    where: { key: KEY },
    select: { valueJson: true },
  });
  const raw = row?.valueJson as unknown;
  const excludedDepartments =
    Array.isArray(raw) && raw.every((x) => typeof x === "string")
      ? raw.map((x) => x.trim()).filter(Boolean)
      : [];

  return NextResponse.json({ excludedDepartments });
}

export async function PUT(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const denied = await requireApiAccess(session, request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const cleaned = Array.from(
      new Set(
        parsed.data.excludedDepartments
          .map((x) => x.trim())
          .filter(Boolean)
      )
    );

    await prisma.appSetting.upsert({
      where: { key: KEY },
      update: { valueJson: cleaned as any },
      create: { key: KEY, valueJson: cleaned as any },
    });

    return NextResponse.json({ success: true, excludedDepartments: cleaned });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "儲存失敗" },
      { status: 500 }
    );
  }
}

