import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  addCalendarDaysUTC,
} from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
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
  const where: { workDate?: Date | { gte: Date; lte: Date } } = {};
  if (startDate && endDate) {
    const start = parseDateOnlyUTC(startDate);
    const end = parseDateOnlyUTC(endDate);
    where.workDate = { gte: start, lte: end };
  } else if (date) {
    where.workDate = parseDateOnlyUTC(date);
  }

  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const list = await prisma.dispatchRecord.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeCode: true, name: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

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
  if (where.workDate && employeeIds.length > 0) {
    const attendances = await prisma.attendanceRecord.findMany({
      where: {
        workDate: where.workDate,
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
    // 同一員工同一日可能有多筆上傳（重複上傳），只取一筆與「人員出勤表」一致，取最新一筆
    for (const a of attendances) {
      const key = `${formatDateOnlyTaipei(a.workDate)}_${a.employeeId}`;
      if (!attendanceByKey.has(key)) {
        attendanceByKey.set(key, {
          workHours: Number(a.workHours),
          locationMatchStatus: a.locationMatchStatus ?? null,
          clockInStoreText: a.clockInStoreText ?? null,
          clockOutStoreText: a.clockOutStoreText ?? null,
        });
      }
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
      return {
        id: d.id,
        workDate: workDateStr,
        employeeId: d.employeeId,
        employeeCode: d.employee.employeeCode,
        employeeName: d.employee.name,
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

