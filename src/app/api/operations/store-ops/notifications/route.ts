import { NextRequest, NextResponse } from "next/server";
import { requireStoreOps } from "@/lib/store-ops-auth";
import { buildStoreOpsNotifications } from "@/modules/store-ops/services/notifications.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const items = await buildStoreOpsNotifications(auth.ctx);
  return NextResponse.json({ items });
}
