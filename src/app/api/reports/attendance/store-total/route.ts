import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC, toStartOfDay } from "@/lib/date";
import { resolveStoreIdsForAttendanceDepartment } from "@/lib/attendance-region-filter";
import { computeDailyMetricsByStore } from "@/modules/performance/services/daily-store-metrics.service";

export const dynamic = "force-dynamic";

function listDaysBetweenYmd(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    const dt = parseDateOnlyUTC(d);
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = formatDateOnly(dt);
  }
  return out;
}

/** 與「每日工效比」相同：依部門篩選加總各門市 laborHours */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate")?.trim() || "";
  const endDate = searchParams.get("endDate")?.trim() || startDate;
  const department = searchParams.get("department")?.trim() || "";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "請提供 startDate 與 endDate" }, { status: 400 });
  }

  try {
    parseDateOnlyUTC(startDate);
    parseDateOnlyUTC(endDate);
  } catch {
    return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });
  }

  const allStores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, department: true },
  });

  const storeIds = department
    ? resolveStoreIdsForAttendanceDepartment(department, allStores)
    : null;

  let totalHours = 0;
  for (const ymd of listDaysBetweenYmd(startDate, endDate)) {
    const metrics = await computeDailyMetricsByStore(toStartOfDay(ymd), {
      reportVisibleOnly: true,
    });
    if (storeIds && storeIds.length > 0) {
      for (const sid of storeIds) {
        totalHours += metrics.get(sid)?.laborHours ?? 0;
      }
    } else {
      for (const m of metrics.values()) {
        totalHours += m.laborHours;
      }
    }
  }

  return NextResponse.json({
    totalHours: Math.round(totalHours * 100) / 100,
    storeIds: storeIds ?? [],
  });
}
