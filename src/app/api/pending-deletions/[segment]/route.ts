import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";
import { targetTypeFromSegment } from "../_shared";

export const dynamic = "force-dynamic";

function fmtDateOnly(d: Date): string {
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { segment: string } }
) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const targetType = targetTypeFromSegment(params.segment);
  if (!targetType) {
    return NextResponse.json({ error: "不支援的類型" }, { status: 404 });
  }

  const rows = await prisma.deletionRequest.findMany({
    where: { targetType, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const targetIds = Array.from(new Set(rows.map((r) => r.targetId)));
  const summariesByTargetId = new Map<string, string>();

  if (targetType === "CONTENT_ENTRY") {
    const entries = await prisma.contentEntry.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, workDate: true, branch: true, totalArticles: true },
    });
    for (const e of entries) {
      summariesByTargetId.set(
        e.id,
        `${fmtDateOnly(e.workDate)}｜${e.branch}${e.totalArticles != null ? `｜總篇數 ${e.totalArticles}` : ""}`
      );
    }
  } else if (targetType === "WORKHOUR_ADJUSTMENT") {
    const adjs = await prisma.workhourAdjustment.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        workDate: true,
        adjustmentType: true,
        adjustmentHours: true,
        employee: { select: { employeeCode: true, name: true } },
      },
    });
    for (const a of adjs) {
      summariesByTargetId.set(
        a.id,
        `${fmtDateOnly(a.workDate)}｜${a.employee.employeeCode} ${a.employee.name}｜${a.adjustmentType}｜${a.adjustmentHours} 小時`
      );
    }
  } else if (targetType === "STORE") {
    const stores = await prisma.store.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true, code: true, department: true },
    });
    for (const s of stores) {
      const code = s.code ? `（${s.code}）` : "";
      const dept = s.department ? `｜${s.department}` : "";
      summariesByTargetId.set(s.id, `門市｜${s.name}${code}${dept}`);
    }
  } else if (targetType === "STORE_HOUR_DEDUCTION") {
    const rows2 = await prisma.storeHourDeduction.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, workDate: true, storeId: true, reason: true, hours: true, note: true },
    });
    const storeIds = Array.from(new Set(rows2.map((r) => r.storeId)));
    const storeMap = new Map<string, { name: string; code: string | null }>();
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, code: true },
    });
    for (const s of stores) storeMap.set(s.id, { name: s.name, code: s.code });
    for (const r of rows2) {
      const s = storeMap.get(r.storeId);
      const storeLabel = s ? `${s.name}${s.code ? `（${s.code}）` : ""}` : r.storeId;
      summariesByTargetId.set(
        r.id,
        `${fmtDateOnly(r.workDate)}｜${storeLabel}｜${r.reason}｜${r.hours} 小時${r.note ? `｜${r.note}` : ""}`
      );
    }
  } else if (targetType === "DISPATCH_RECORD") {
    const rows2 = await prisma.dispatchRecord.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        workDate: true,
        dispatchHours: true,
        actualHours: true,
        employee: { select: { employeeCode: true, name: true } },
        fromStoreId: true,
        toStoreId: true,
      },
    });
    const storeIds = Array.from(
      new Set(rows2.flatMap((r) => [r.fromStoreId, r.toStoreId]).filter(Boolean) as string[])
    );
    const storeMap = new Map<string, { name: string; code: string | null }>();
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, code: true },
    });
    for (const s of stores) storeMap.set(s.id, { name: s.name, code: s.code });
    for (const r of rows2) {
      const from = r.fromStoreId ? storeMap.get(r.fromStoreId) : null;
      const to = storeMap.get(r.toStoreId);
      const fromLabel = from ? `${from.name}${from.code ? `（${from.code}）` : ""}` : "—";
      const toLabel = to ? `${to.name}${to.code ? `（${to.code}）` : ""}` : r.toStoreId;
      const h = r.actualHours != null ? r.actualHours : r.dispatchHours;
      summariesByTargetId.set(
        r.id,
        `${fmtDateOnly(r.workDate)}｜${r.employee.employeeCode} ${r.employee.name}｜${fromLabel} → ${toLabel}｜${h} 小時`
      );
    }
  }

  return NextResponse.json({
    targetType,
    requests: rows.map((r) => ({
      ...r,
      targetSummary: summariesByTargetId.get(r.targetId) ?? null,
    })),
  });
}
