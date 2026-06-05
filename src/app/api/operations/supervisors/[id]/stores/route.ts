import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLE_KEYS } from "@/lib/roles";
import { assertRoles, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeIds: z.array(z.string().min(1)),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const roleDenied = assertRoles(auth.ctx, ROLE_KEYS.ADMIN);
  if (roleDenied) return roleDenied;

  const { id } = await params;
  const user = await prisma.appUser.findUnique({
    where: { id },
    include: { role: { select: { key: true } } },
  });
  if (!user) {
    return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
  }
  if (user.role?.key !== ROLE_KEYS.SUPERVISOR) {
    return NextResponse.json({ error: "僅可更新督導帳號的負責門市" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "欄位錯誤", details: parsed.error.flatten() }, { status: 400 });
  }

  const storeIds = [...new Set(parsed.data.storeIds)];
  if (storeIds.length > 0) {
    const stores = await prisma.retailStore.findMany({
      where: { id: { in: storeIds }, isActive: true },
      select: { id: true },
    });
    if (stores.length !== storeIds.length) {
      return NextResponse.json({ error: "部分門市不存在或已停用" }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.supervisorStore.deleteMany({ where: { supervisorId: id } }),
    ...(storeIds.length > 0 ?
      [
        prisma.supervisorStore.createMany({
          data: storeIds.map((storeId) => ({ supervisorId: id, storeId })),
        }),
      ]
    : []),
  ]);

  const updated = await prisma.supervisorStore.findMany({
    where: { supervisorId: id },
    select: {
      storeId: true,
      store: { select: { storeName: true, region: true } },
    },
  });

  return NextResponse.json({
    supervisorId: id,
    stores: updated.map((s) => ({
      storeId: s.storeId,
      storeName: s.store.storeName,
      region: s.store.region,
    })),
  });
}
