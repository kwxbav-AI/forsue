/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function fmtDateOnly(d) {
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

async function main() {
  const pending = await prisma.deletionRequest.findMany({
    where: { status: "PENDING", targetSummary: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, targetType: true, targetId: true },
  });

  const dispatchIds = pending
    .filter((r) => r.targetType === "DISPATCH_RECORD")
    .map((r) => r.targetId);

  if (dispatchIds.length === 0) {
    console.log("No pending requests to backfill.");
    return;
  }

  const dispatchRows = await prisma.dispatchRecord.findMany({
    where: { id: { in: Array.from(new Set(dispatchIds)) } },
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
    new Set(
      dispatchRows
        .flatMap((r) => [r.fromStoreId, r.toStoreId])
        .filter(Boolean)
    )
  );
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, code: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, { name: s.name, code: s.code }]));

  const summaryByDispatchId = new Map();
  for (const r of dispatchRows) {
    const from = r.fromStoreId ? storeMap.get(r.fromStoreId) : null;
    const to = storeMap.get(r.toStoreId);
    const fromLabel = from ? `${from.name}${from.code ? `（${from.code}）` : ""}` : "—";
    const toLabel = to ? `${to.name}${to.code ? `（${to.code}）` : ""}` : r.toStoreId;
    const h = r.actualHours != null ? Number(r.actualHours) : Number(r.dispatchHours);
    summaryByDispatchId.set(
      r.id,
      `${fmtDateOnly(r.workDate)}｜${r.employee.employeeCode} ${r.employee.name}｜${fromLabel} → ${toLabel}｜${h} 小時`
    );
  }

  let updated = 0;
  for (const req of pending) {
    if (req.targetType !== "DISPATCH_RECORD") continue;
    const summary = summaryByDispatchId.get(req.targetId);
    if (!summary) continue;
    await prisma.deletionRequest.update({
      where: { id: req.id },
      data: { targetSummary: summary },
    });
    updated += 1;
  }

  console.log(`Backfill done. Updated ${updated} pending request(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

