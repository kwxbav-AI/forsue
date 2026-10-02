import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";
import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";

export const dynamic = "force-dynamic";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

/**
 * 合併舊版匯入拆開的跨日出勤。
 *
 * 舊版匯入會把加班過午夜的出勤拆成兩筆：上班日「到 24:00」＋次日「00:00 起」。
 * 現行規則是整筆算在上班日，這支工具把既有資料的次日片段併回上班日那筆。
 *
 * GET  /api/dev/merge-cross-day-attendance?start=2026-09-01&end=2026-09-30  → 只列出會合併的資料（不寫入）
 * POST 同樣參數                                                              → 實際合併，並重算受影響日期的每日績效
 *
 * start/end 指的是「上班日」的範圍。
 */
async function findPairs(startYmd: string, endYmd: string) {
  // 次日片段落在 上班日+1，所以查詢範圍往後推一天
  const fragments = await prisma.attendanceRecord.findMany({
    where: {
      startTime: "00:00",
      workDate: {
        gte: parseDateOnlyUTC(addCalendarDaysUTC(startYmd, 1)),
        lte: parseDateOnlyUTC(addCalendarDaysUTC(endYmd, 1)),
      },
    },
    select: {
      id: true,
      employeeId: true,
      workDate: true,
      workHours: true,
      endTime: true,
      originalStoreId: true,
      department: true,
      employee: { select: { employeeCode: true, name: true } },
    },
    orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
  });

  const pairs: Array<{
    fragment: (typeof fragments)[number];
    first: { id: string; workHours: unknown; startTime: string | null };
    workYmd: string;
  }> = [];
  const skipped: Array<{ employeeCode: string; name: string; fragmentDate: string; reason: string }> = [];

  for (const f of fragments) {
    const fragmentYmd = formatDateOnly(f.workDate);
    const workYmd = addCalendarDaysUTC(fragmentYmd, -1);
    const firsts = await prisma.attendanceRecord.findMany({
      where: { employeeId: f.employeeId, workDate: parseDateOnlyUTC(workYmd), endTime: "24:00" },
      select: { id: true, workHours: true, startTime: true },
    });
    if (firsts.length !== 1) {
      skipped.push({
        employeeCode: f.employee.employeeCode,
        name: f.employee.name,
        fragmentDate: fragmentYmd,
        reason:
          firsts.length === 0
            ? "前一天找不到「到 24:00」的出勤，無法確定是跨日拆分，未處理"
            : "前一天有多筆「到 24:00」的出勤，未處理",
      });
      continue;
    }
    pairs.push({ fragment: f, first: firsts[0], workYmd });
  }
  return { pairs, skipped };
}

function parseRange(request: NextRequest): { start: string; end: string } | { error: string } {
  const sp = request.nextUrl.searchParams;
  const start = sp.get("start")?.trim() ?? "";
  const end = sp.get("end")?.trim() ?? "";
  if (!YMD_RE.test(start) || !YMD_RE.test(end)) return { error: "請提供 start、end（YYYY-MM-DD）" };
  if (end < start) return { error: "end 不可早於 start" };
  const days = (parseDateOnlyUTC(end).getTime() - parseDateOnlyUTC(start).getTime()) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return { error: `一次最多處理 ${MAX_RANGE_DAYS} 天` };
  return { start, end };
}

function describe(pairs: Awaited<ReturnType<typeof findPairs>>["pairs"]) {
  return pairs.map((p) => ({
    employeeCode: p.fragment.employee.employeeCode,
    name: p.fragment.employee.name,
    department: p.fragment.department,
    workDate: p.workYmd,
    startTime: p.first.startTime,
    endTime: p.fragment.endTime,
    hoursOnWorkDate: Number(p.first.workHours),
    hoursOnNextDay: Number(p.fragment.workHours),
    mergedHours: Math.round((Number(p.first.workHours) + Number(p.fragment.workHours)) * 100) / 100,
  }));
}

async function requireAdmin() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (session.roleKey !== "ADMIN") return NextResponse.json({ error: "僅限管理員" }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const range = parseRange(request);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const { pairs, skipped } = await findPairs(range.start, range.end);
  return NextResponse.json({ dryRun: true, ...range, count: pairs.length, merges: describe(pairs), skipped });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const range = parseRange(request);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const { pairs, skipped } = await findPairs(range.start, range.end);
  const merges = describe(pairs);

  await prisma.$transaction(
    async (tx) => {
      for (const p of pairs) {
        await tx.attendanceRecord.update({
          where: { id: p.first.id },
          data: {
            workHours: Math.round((Number(p.first.workHours) + Number(p.fragment.workHours)) * 100) / 100,
            endTime: p.fragment.endTime,
          },
        });
        await tx.attendanceRecord.delete({ where: { id: p.fragment.id } });
      }
    },
    { maxWait: 10_000, timeout: 120_000 }
  );

  // 上班日與次日的工時都變了，兩天都要重算
  const affected = new Set<string>();
  for (const p of pairs) {
    affected.add(p.workYmd);
    affected.add(addCalendarDaysUTC(p.workYmd, 1));
  }
  const recalculated = Array.from(affected).sort();
  for (const ymd of recalculated) {
    await performanceEngineService.recalculateDailyPerformance(parseDateOnlyUTC(ymd));
  }

  return NextResponse.json({ dryRun: false, ...range, count: pairs.length, merges, skipped, recalculated });
}
