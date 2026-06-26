import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  addCalendarDaysUTC,
} from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { getSessionFromRequest } from "@/lib/auth-request";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string(),
  fromStoreId: z.string().optional().nullable(),
  toStoreId: z.string(),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(), // YYYY-MM-DD
  startTime: z.string(), // HH:mm
  endTime: z.string(), // HH:mm
  remark: z.string().optional().nullable(),
});

function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // backward compatible
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const latest = searchParams.get("latest");
  const takeParam = searchParams.get("take");
  const storeIdFilter = searchParams.get("storeId");
  const debug = searchParams.get("debug") === "1";

  // debug 模式：回傳診斷資訊（不含完整列表）
  if (debug && storeIdFilter) {
    const homeEmployees = await prisma.employee.findMany({
      where: { defaultStoreId: storeIdFilter, isActive: true },
      select: { id: true, name: true, employeeCode: true, defaultStoreId: true },
    });
    const workDateWhere2 = startDate && endDate
      ? { workDate: { gte: parseDateOnlyUTC(startDate), lte: parseDateOnlyUTC(endDate) } }
      : {};
    const allInRange = await prisma.dispatchRecord.findMany({
      where: workDateWhere2,
      select: { workDate: true, fromStoreId: true, toStoreId: true, employeeId: true },
      orderBy: { workDate: "asc" },
      take: 20,
    });
    return NextResponse.json({
      storeIdFilter,
      homeEmployees,
      allDispatchInRange: allInRange,
    });
  }
  const workDateWhere: { workDate?: Date | { gte: Date; lte: Date } } = {};
  if (startDate && endDate) {
    workDateWhere.workDate = { gte: parseDateOnlyUTC(startDate), lte: parseDateOnlyUTC(endDate) };
  } else if (date) {
    workDateWhere.workDate = parseDateOnlyUTC(date);
  }

  // 若有 storeId 篩選，同時涵蓋 fromStoreId = null 但員工 defaultStoreId 為本店的調出紀錄
  let dispatchWhere: object = workDateWhere;
  if (storeIdFilter) {
    const homeEmployees = await prisma.employee.findMany({
      where: { defaultStoreId: storeIdFilter, isActive: true },
      select: { id: true },
    });
    const homeEmployeeIds = homeEmployees.map((e) => e.id);
    const orConditions: object[] = [
      { fromStoreId: storeIdFilter },
      { toStoreId: storeIdFilter },
    ];
    if (homeEmployeeIds.length > 0) {
      orConditions.push({ employeeId: { in: homeEmployeeIds } });
    }
    dispatchWhere = { ...workDateWhere, OR: orConditions };
  }

  const isLatestMode = !workDateWhere.workDate && latest === "1";
  const takeRequested = takeParam ? parseInt(takeParam, 10) : NaN;
  const take =
    Number.isFinite(takeRequested) && takeRequested > 0
      ? Math.min(500, Math.max(1, takeRequested))
      : isLatestMode
        ? 50
        : 500;

  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const list = await prisma.dispatchRecord.findMany({
    where: dispatchWhere,
    include: {
      employee: { select: { id: true, employeeCode: true, name: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take,
  });

  const creatorCodes = [
    ...new Set(list.map((d) => d.createdBy?.trim()).filter(Boolean)),
  ] as string[];
  const creators =
    creatorCodes.length > 0 ?
      await prisma.employee.findMany({
        where: { employeeCode: { in: creatorCodes } },
        select: { employeeCode: true, name: true },
      })
    : [];
  const creatorNameByCode = new Map(creators.map((e) => [e.employeeCode, e.name]));

  // 避免 TypeScript 在非 ES2015 目標下對 Set 可迭代展開（...）的限制
  const employeeIds = Array.from(new Set(list.map((d) => d.employeeId)));
  const attendanceByKey = new Map<
    string,
    {
      workHours: number;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  >();
  if (employeeIds.length > 0 && list.length > 0) {
    const ymdSet = new Set<string>();
    for (const d of list) {
      ymdSet.add(formatDateOnlyTaipei(d.workDate));
    }
    const dates = Array.from(ymdSet).map((ymd) => parseDateOnlyUTC(ymd));
    const attendances = await prisma.attendanceRecord.findMany({
      where: {
        workDate: { in: dates },
        employeeId: { in: employeeIds },
      },
      select: {
        workDate: true,
        employeeId: true,
        workHours: true,
        locationMatchStatus: true,
        clockInStoreText: true,
        clockOutStoreText: true,
      },
      orderBy: { createdAt: "desc" },
    });
    // 同一員工同一日可能有多筆（例如中間請假、跨天拆分），需加總工時
    for (const a of attendances) {
      const key = `${formatDateOnlyTaipei(a.workDate)}_${a.employeeId}`;
      const prev = attendanceByKey.get(key);
      const nextHours = (prev?.workHours ?? 0) + Number(a.workHours);
      attendanceByKey.set(key, {
        workHours: nextHours,
        // 多筆時狀態/地點資訊可能不一致，避免誤導：維持第一筆（最新）顯示即可
        locationMatchStatus: prev?.locationMatchStatus ?? a.locationMatchStatus ?? null,
        clockInStoreText: prev?.clockInStoreText ?? a.clockInStoreText ?? null,
        clockOutStoreText: prev?.clockOutStoreText ?? a.clockOutStoreText ?? null,
      });
    }
  }

  const TOLERANCE = 0.5;
  function compareResultByDiff(hoursDiff: number | null): "一致" | "延長" | "縮短" | null {
    if (hoursDiff == null) return null;
    if (Math.abs(hoursDiff) <= TOLERANCE) return "一致";
    return hoursDiff > 0 ? "延長" : "縮短";
  }

  return NextResponse.json(
    list.map((d) => {
      const planned = Number(d.dispatchHours);
      const actual = d.actualHours != null ? Number(d.actualHours) : null;
      const effective = actual ?? planned;
      const effectiveRounded = Math.round(effective * 100) / 100;
      const diff = actual != null ? Math.round((actual - planned) * 100) / 100 : null;
      const workDateStr = formatDateOnlyTaipei(d.workDate);
      const att = attendanceByKey.get(`${workDateStr}_${d.employeeId}`) ?? null;
      const attendanceHours = att ? att.workHours : null;
      const attendanceHoursRounded =
        attendanceHours != null ? Math.round(attendanceHours * 100) / 100 : null;
      const comparisonResult = compareResultByDiff(diff);
      const createdByCode = d.createdBy?.trim() || null;
      const filledAt = d.createdAt.toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return {
        id: d.id,
        workDate: workDateStr,
        employeeId: d.employeeId,
        employeeCode: d.employee.employeeCode,
        employeeName: d.employee.name,
        createdByCode,
        createdByName:
          createdByCode ?
            (creatorNameByCode.get(createdByCode) ?? createdByCode)
          : null,
        filledAt,
        fromStoreId: d.fromStoreId,
        toStoreId: d.toStoreId,
        fromStoreName: d.fromStoreId ? storeNameById.get(d.fromStoreId) ?? null : null,
        toStoreName: storeNameById.get(d.toStoreId) ?? null,
        dispatchHours: planned,
        actualHours: actual,
        confirmStatus: d.confirmStatus ?? null,
        effectiveHours: effectiveRounded,
        hoursDiff: diff,
        attendanceHours: attendanceHoursRounded,
        comparisonResult,
        startTime: d.startTime,
        endTime: d.endTime,
        remark: d.remark,
        locationMatchStatus: att?.locationMatchStatus ?? null,
        clockInStoreText: att?.clockInStoreText ?? null,
        clockOutStoreText: att?.clockOutStoreText ?? null,
      };
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { employeeId, fromStoreId, toStoreId, startDate, endDate, startTime, endTime, remark } =
      parsed.data;
    const startD = parseDateOnlyUTC(startDate.trim());
    const endD = parseDateOnlyUTC(endDate.trim());
    if (endD.getTime() < startD.getTime()) {
      return NextResponse.json({ error: "結束日期不可早於開始日期" }, { status: 400 });
    }

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (startMin == null || endMin == null) {
      return NextResponse.json({ error: "時間格式必須為 HH:mm" }, { status: 400 });
    }
    if (endMin <= startMin) {
      return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
    }

    const minutes = endMin - startMin;
    const hours = minutes / 60;

    const createdIds: string[] = [];
    const touchedDates: Date[] = [];

    // 若未指定 fromStoreId，則以「出勤原門市」為準（同一員工同一日可能多筆上傳，只取最新一筆）
    const fromStoreByDate = new Map<string, string | null>();
    if (!fromStoreId) {
      const attStart = parseDateOnlyUTC(startDate.trim());
      const attEnd = parseDateOnlyUTC(endDate.trim());
      const attendances = await prisma.attendanceRecord.findMany({
        where: {
          employeeId,
          workDate: { gte: attStart, lte: attEnd },
        },
        select: { workDate: true, originalStoreId: true },
        orderBy: { createdAt: "desc" },
      });
      for (const a of attendances) {
        const key = formatDateOnly(a.workDate);
        if (!fromStoreByDate.has(key)) fromStoreByDate.set(key, a.originalStoreId ?? null);
      }
    }

    let dayStr = startDate.trim();
    const endStr = endDate.trim();
    while (dayStr <= endStr) {
      const workDate = parseDateOnlyUTC(dayStr);
      const created = await prisma.dispatchRecord.create({
        data: {
          workDate,
          employeeId,
          fromStoreId: fromStoreId ?? fromStoreByDate.get(dayStr) ?? null,
          toStoreId,
          dispatchHours: hours,
          confirmStatus: "待確認",
          startTime,
          endTime,
          remark: remark ?? null,
          createdBy: session?.username?.trim() || null,
        },
      });
      createdIds.push(created.id);
      touchedDates.push(workDate);
      dayStr = addCalendarDaysUTC(dayStr, 1);
    }

    for (const d of touchedDates) {
      await performanceEngineService.recalculateDailyPerformance(d);
    }

    return NextResponse.json({ success: true, createdCount: createdIds.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "建立失敗" },
      { status: 500 }
    );
  }
}

