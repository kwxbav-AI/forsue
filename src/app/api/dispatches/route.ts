import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toDateRange, toStartOfDay, formatDateOnly } from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";
import { addDays } from "date-fns";

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
    const range = toDateRange(startDate, endDate);
    where.workDate = { gte: range.start, lte: range.end };
  } else if (date) {
    where.workDate = toStartOfDay(date);
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

  const employeeIds = [...new Set(list.map((d) => d.employeeId))];
  const attendanceByKey = new Map<string, number>();
  if (where.workDate && employeeIds.length > 0) {
    const attendances = await prisma.attendanceRecord.findMany({
      where: {
        workDate: where.workDate,
        employeeId: { in: employeeIds },
      },
      select: { workDate: true, employeeId: true, workHours: true },
      orderBy: { createdAt: "desc" },
    });
    // 同一員工同一日可能有多筆上傳（重複上傳），只取一筆與「人員出勤表」一致，取最新一筆
    for (const a of attendances) {
      const key = `${formatDateOnly(a.workDate)}_${a.employeeId}`;
      if (!attendanceByKey.has(key)) attendanceByKey.set(key, Number(a.workHours));
    }
  }

  const TOLERANCE = 0.5;
  function compareResult(
    effectiveHours: number,
    attendanceHours: number | null
  ): "待比對" | "一致" | "延長" | "縮短" {
    if (attendanceHours == null) return "待比對";
    const diff = effectiveHours - attendanceHours;
    if (Math.abs(diff) <= TOLERANCE) return "一致";
    return diff > 0 ? "延長" : "縮短";
  }

  return NextResponse.json(
    list.map((d) => {
      const planned = Number(d.dispatchHours);
      const actual = d.actualHours != null ? Number(d.actualHours) : null;
      const effective = actual ?? planned;
      const effectiveRounded = Math.round(effective * 100) / 100;
      const diff = actual != null ? Math.round((actual - planned) * 100) / 100 : null;
      const workDateStr = formatDateOnly(d.workDate);
      const attendanceHours =
        attendanceByKey.get(`${workDateStr}_${d.employeeId}`) ?? null;
      const attendanceHoursRounded =
        attendanceHours != null ? Math.round(attendanceHours * 100) / 100 : null;
      const comparisonResult = compareResult(effectiveRounded, attendanceHoursRounded);
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
    const startD = toStartOfDay(startDate);
    const endD = toStartOfDay(endDate);
    if (endD < startD) {
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

    let cursor = startD;
    while (cursor <= endD) {
      const workDate = toStartOfDay(cursor);
      const created = await prisma.dispatchRecord.create({
        data: {
          workDate,
          employeeId,
          fromStoreId: fromStoreId ?? null,
          toStoreId,
          dispatchHours: hours,
          startTime,
          endTime,
          remark: remark ?? null,
        },
      });
      createdIds.push(created.id);
      touchedDates.push(workDate);
      cursor = addDays(cursor, 1);
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

