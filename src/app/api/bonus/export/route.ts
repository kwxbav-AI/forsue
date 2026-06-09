import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearMonth = searchParams.get("yearMonth");

  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: "請提供 yearMonth (YYYY-MM)" }, { status: 400 });
  }

  const results = await prisma.monthlyBonusResult.findMany({
    where: { yearMonth },
    include: { dailyDetails: { orderBy: { workDate: "asc" } } },
    orderBy: [{ storeName: "asc" }, { employeeName: "asc" }],
  });

  const wb = XLSX.utils.book_new();

  // ── 彙總頁 ──
  const summaryData = [
    ["員工編號", "姓名", "部門", "職稱", "計算工時", "達標獎金", "營運成果獎金", "小計獎金", "新人比例", "獎金倍率", "權責比例", "最終獎金", "備註"],
    ...results.map((r: typeof results[number]) => {
      let note = "";
      if (r.isNewStoreGuarantee) note += "⬆新店保障";
      if (Number(r.newHireRatio) < 1) note += ` 新人${Math.round(Number(r.newHireRatio) * 100)}%`;
      return [
        r.employeeCode,
        r.employeeName,
        r.storeName,
        r.position ?? "",
        Number(r.totalCalcHours),
        Number(r.targetBonus),
        Number(r.operationsBonus),
        Number(r.subtotalBonus),
        Number(r.newHireRatio),
        Number(r.bonusMultiplier),
        Number(r.accountabilityRatio),
        Number(r.finalBonus),
        note.trim(),
      ];
    }),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [10, 8, 14, 10, 8, 8, 10, 8, 8, 8, 8, 8, 12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsSummary, "績效獎金彙總");

  // ── 每日明細頁 ──
  const detailRows: (string | number | boolean)[][] = [
    ["員工編號", "姓名", "部門", "日期", "星期", "門市", "達標", "超標", "工效比", "表訂時數", "實際工時", "計算工時", "基礎獎金", "當日獎金", "調度說明"],
  ];
  for (const r of results) {
    const weekdayLabel = ["日", "一", "二", "三", "四", "五", "六"];
    for (const d of r.dailyDetails) {
      detailRows.push([
        r.employeeCode,
        r.employeeName,
        r.storeName,
        typeof d.workDate === "string" ? d.workDate : (d.workDate as Date).toISOString().slice(0, 10),
        weekdayLabel[d.weekday] ?? "",
        d.storeName,
        d.isTargetMet ? "是" : "否",
        d.isExceeded ? "是" : "否",
        Number(d.efficiencyRatio),
        Number(d.scheduledHours),
        Number(d.actualWorkHours),
        Number(d.calcHours),
        Number(d.baseBonus),
        Number(d.dailyBonus),
        d.dispatchNote ?? "",
      ]);
    }
  }
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [10, 8, 14, 12, 4, 14, 4, 4, 8, 8, 8, 8, 8, 8, 8].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsDetail, "每日明細");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `績效獎金_${yearMonth}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
