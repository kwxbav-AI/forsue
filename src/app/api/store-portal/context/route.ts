import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, "").toLowerCase();
}

async function findPerformanceStoreId(storeName: string): Promise<string | null> {
  const perfStores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const normalized = normalizeKey(storeName);
  for (const s of perfStores) {
    if (normalizeKey(s.name) === normalized) return s.id;
  }
  for (const s of perfStores) {
    if (normalizeKey(s.name).includes(normalized) || normalized.includes(normalizeKey(s.name))) {
      return s.id;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const isAdmin = session.roleKey === "ADMIN";
  const overrideStoreId = request.nextUrl.searchParams.get("storeId");

  // ADMIN 或督導（有 supervisorStores）傳 storeId 時，直接用該門市
  if (overrideStoreId) {
    const isSupervisorOfStore =
      !isAdmin &&
      (await prisma.supervisorStore.count({
        where: { supervisorId: session.userId, storeId: overrideStoreId },
      })) > 0;

    if (isAdmin || isSupervisorOfStore) {
      const retailStore = await prisma.retailStore.findUnique({
        where: { id: overrideStoreId },
        select: { id: true, storeName: true, region: true },
      });
      if (!retailStore) {
        return NextResponse.json({ error: "找不到指定門市" }, { status: 404 });
      }
      const performanceStoreId = await findPerformanceStoreId(retailStore.storeName);
      return NextResponse.json({
        userId: session.userId,
        username: session.username,
        isAdmin: true,
        retailStoreId: retailStore.id,
        storeName: retailStore.storeName,
        region: retailStore.region ?? null,
        performanceStoreId,
      });
    }
  }

  if (isAdmin && !overrideStoreId) {
    return NextResponse.json({ error: "ADMIN 請指定 storeId" }, { status: 400 });
  }

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      retailStore: { select: { id: true, storeName: true, region: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "找不到使用者" }, { status: 404 });

  const retailStore = user.retailStore;
  if (!retailStore) {
    return NextResponse.json({ error: "此帳號尚未綁定門市" }, { status: 400 });
  }

  const performanceStoreId = await findPerformanceStoreId(retailStore.storeName);

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    isAdmin: false,
    retailStoreId: retailStore.id,
    storeName: retailStore.storeName,
    region: retailStore.region ?? null,
    performanceStoreId,
  });
}
