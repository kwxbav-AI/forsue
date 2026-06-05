import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLE_KEYS } from "@/lib/roles";
import { assertRoles, requireStoreOps } from "@/lib/store-ops-auth";
import { buildAnnouncementWhere } from "@/modules/store-ops/services/notifications.service";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  targetType: z.enum(["ALL", "REGION", "STORE"]).optional(),
  targetRegion: z.string().optional().nullable(),
  targetStoreId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const where = await buildAnnouncementWhere(auth.ctx);
  const list = await prisma.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ items: list });
}

export async function POST(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN, ROLE_KEYS.SUPERVISOR);
  if (roleDenied) return roleDenied;

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

  const targetType = parsed.data.targetType ?? "ALL";
  if (targetType === "REGION" && !parsed.data.targetRegion?.trim()) {
    return NextResponse.json({ error: "區域公告需指定 targetRegion" }, { status: 400 });
  }
  if (targetType === "STORE" && !parsed.data.targetStoreId?.trim()) {
    return NextResponse.json({ error: "門市公告需指定 targetStoreId" }, { status: 400 });
  }

  const created = await prisma.announcement.create({
    data: {
      title: parsed.data.title.trim(),
      content: parsed.data.content.trim(),
      targetType,
      targetRegion: targetType === "REGION" ? parsed.data.targetRegion!.trim() : null,
      targetStoreId: targetType === "STORE" ? parsed.data.targetStoreId!.trim() : null,
      publishedBy: auth.ctx.username,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
