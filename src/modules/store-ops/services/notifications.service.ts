import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth-context";
import { ROLE_KEYS } from "@/lib/roles";
import { formatDateOnlyTaipei, parseDateOnlyUTC } from "@/lib/date";

export type StoreOpsNotification = {
  id: string;
  type: string;
  title: string;
  meta: Record<string, unknown>;
  status: string;
  createdAt: string;
};

function push(
  out: StoreOpsNotification[],
  row: {
    id: string;
    type: string;
    title: string;
    meta: Record<string, unknown>;
    status: string;
    createdAt: Date;
  }
) {
  out.push({
    id: row.id,
    type: row.type,
    title: row.title,
    meta: row.meta,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function buildStoreOpsNotifications(ctx: AuthContext): Promise<StoreOpsNotification[]> {
  const out: StoreOpsNotification[] = [];
  const todayYmd = formatDateOnlyTaipei();
  const today = parseDateOnlyUTC(todayYmd);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const role = ctx.roleKey;
  const storeScope =
    ctx.allowedStoreIds === null ?
      undefined
    : ctx.allowedStoreIds.length > 0 ?
      { in: ctx.allowedStoreIds }
    : { in: ["__none__"] };

  const includeSupervisor =
    role === ROLE_KEYS.ADMIN || role === ROLE_KEYS.SUPERVISOR;
  const includeLogistics = role === ROLE_KEYS.ADMIN || role === ROLE_KEYS.LOGISTICS;
  const includePurchase = role === ROLE_KEYS.ADMIN || role === ROLE_KEYS.PURCHASE;
  const includeStaff = role === ROLE_KEYS.ADMIN || role === ROLE_KEYS.STORE_STAFF;

  if (includeSupervisor) {
    const pendingSupplies = await prisma.supplyRequest.findMany({
      where: {
        status: "PENDING",
        ...(storeScope ? { storeId: storeScope } : {}),
      },
      include: { store: { select: { storeName: true } } },
      orderBy: { submittedAt: "desc" },
      take: 50,
    });
    for (const s of pendingSupplies) {
      push(out, {
        id: `supply-pending-${s.id}`,
        type: "supply_pending",
        title: "物資申請待簽核",
        meta: { supplyId: s.id, storeId: s.storeId, storeName: s.store.storeName, itemName: s.itemName },
        status: s.status,
        createdAt: s.submittedAt,
      });
    }

    const draftJournals = await prisma.dailyReport.findMany({
      where: {
        reportDate: today,
        status: "DRAFT",
        ...(storeScope ? { storeId: storeScope } : {}),
      },
      include: { store: { select: { storeName: true } } },
      take: 50,
    });
    for (const j of draftJournals) {
      push(out, {
        id: `journal-draft-${j.id}`,
        type: "journal_draft",
        title: "工作日誌未提交",
        meta: { journalId: j.id, storeId: j.storeId, storeName: j.store.storeName, reportDate: todayYmd },
        status: j.status,
        createdAt: j.updatedAt,
      });
    }

    const overdueRepairs = await prisma.repairRequest.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        createdAt: { lt: sevenDaysAgo },
        ...(storeScope ? { storeId: storeScope } : {}),
      },
      include: { store: { select: { storeName: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (const r of overdueRepairs) {
      push(out, {
        id: `repair-overdue-${r.id}`,
        type: "repair_overdue",
        title: "報修逾期",
        meta: { repairId: r.id, storeId: r.storeId, storeName: r.store.storeName, equipment: r.equipment },
        status: r.status,
        createdAt: r.createdAt,
      });
    }
  }

  if (includeLogistics) {
    const toShip = await prisma.supplyRequest.findMany({
      where: { status: "APPROVED" },
      include: { store: { select: { storeName: true } } },
      orderBy: { reviewedAt: "desc" },
      take: 50,
    });
    for (const s of toShip) {
      push(out, {
        id: `supply-approved-${s.id}`,
        type: "supply_approved",
        title: "已核准待配送",
        meta: { supplyId: s.id, storeId: s.storeId, storeName: s.store.storeName, itemName: s.itemName },
        status: s.status,
        createdAt: s.reviewedAt ?? s.submittedAt,
      });
    }
  }

  if (includePurchase) {
    const wishes = await prisma.wishItem.findMany({
      where: { purchaseReply: null },
      include: { store: { select: { storeName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const w of wishes) {
      push(out, {
        id: `wish-pending-${w.id}`,
        type: "wish_pending",
        title: "許願池待回覆",
        meta: { wishId: w.id, storeId: w.storeId, storeName: w.store.storeName, title: w.title },
        status: "PENDING",
        createdAt: w.createdAt,
      });
    }
  }

  if (includeStaff && ctx.allowedStoreIds?.length === 1) {
    const myStoreId = ctx.allowedStoreIds[0];
    const supplyUpdates = await prisma.supplyRequest.findMany({
      where: {
        storeId: myStoreId,
        status: { in: ["APPROVED", "SHIPPED", "RECEIVED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    for (const s of supplyUpdates) {
      push(out, {
        id: `supply-progress-${s.id}`,
        type: "supply_progress",
        title: "物資申請進度更新",
        meta: { supplyId: s.id, itemName: s.itemName, status: s.status },
        status: s.status,
        createdAt: s.updatedAt,
      });
    }

    const store = await prisma.retailStore.findUnique({
      where: { id: myStoreId },
      select: { region: true },
    });
    const recentAnnouncements = await prisma.announcement.findMany({
      where: {
        createdAt: { gt: sevenDaysAgo },
        OR: [
          { targetType: "ALL" },
          ...(store?.region ? [{ targetType: "REGION" as const, targetRegion: store.region }] : []),
          { targetType: "STORE", targetStoreId: myStoreId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const a of recentAnnouncements) {
      push(out, {
        id: `announcement-${a.id}`,
        type: "announcement_new",
        title: "新公告",
        meta: { announcementId: a.id, announcementTitle: a.title },
        status: "NEW",
        createdAt: a.createdAt,
      });
    }
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return out;
}

export async function buildAnnouncementWhere(ctx: AuthContext) {
  if (ctx.roleKey === ROLE_KEYS.ADMIN || ctx.allowedStoreIds === null) {
    return {};
  }
  if (ctx.allowedStoreIds.length === 0) {
    return { id: "__none__" };
  }
  const stores = await prisma.retailStore.findMany({
    where: { id: { in: ctx.allowedStoreIds } },
    select: { id: true, region: true },
  });
  const storeIds = stores.map((s) => s.id);
  const regions = [...new Set(stores.map((s) => s.region).filter((r): r is string => Boolean(r)))];
  return {
    OR: [
      { targetType: "ALL" as const },
      ...(regions.length ?
        [{ targetType: "REGION" as const, targetRegion: { in: regions } }]
      : []),
      { targetType: "STORE" as const, targetStoreId: { in: storeIds } },
    ],
  };
}
