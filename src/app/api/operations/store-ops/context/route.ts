import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeRetailStore } from "@/lib/operations-serialize";
import { requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const { ctx } = auth;
  const stores = await prisma.retailStore.findMany({
    where:
      ctx.allowedStoreIds === null ?
        { isActive: true }
      : ctx.allowedStoreIds.length > 0 ?
        { id: { in: ctx.allowedStoreIds }, isActive: true }
      : { id: "__none__" },
    orderBy: [{ region: "asc" }, { storeName: "asc" }],
  });

  return NextResponse.json({
    roleKey: ctx.roleKey,
    username: ctx.username,
    allowedStoreIds: ctx.allowedStoreIds,
    stores: stores.map(serializeRetailStore),
  });
}
