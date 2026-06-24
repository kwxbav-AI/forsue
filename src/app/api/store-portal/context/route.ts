import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, "").toLowerCase();
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      retailStoreId: true,
      retailStore: { select: { id: true, storeName: true, region: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
  }

  const retailStore = user.retailStore;
  if (!retailStore) {
    return NextResponse.json({ error: "此帳號尚未綁定門市" }, { status: 400 });
  }

  const normalizedName = normalizeKey(retailStore.storeName);
  const perfStores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let performanceStoreId: string | null = null;
  for (const s of perfStores) {
    if (normalizeKey(s.name) === normalizedName) {
      performanceStoreId = s.id;
      break;
    }
  }
  if (!performanceStoreId) {
    for (const s of perfStores) {
      if (
        normalizeKey(s.name).includes(normalizedName) ||
        normalizedName.includes(normalizeKey(s.name))
      ) {
        performanceStoreId = s.id;
        break;
      }
    }
  }

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    retailStoreId: retailStore.id,
    storeName: retailStore.storeName,
    region: retailStore.region ?? null,
    performanceStoreId,
  });
}
