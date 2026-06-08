import type { DeletionRequestTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { deactivateStoreWithLog } from "@/lib/store-deactivate";

export const DELETE_APPROVE_MODULE_KEY: Record<DeletionRequestTargetType, string> = {
  CONTENT_ENTRY: "delete-approve-content-entries",
  WORKHOUR_ADJUSTMENT: "delete-approve-workhour-adjustments",
  STORE: "delete-approve-stores",
  STORE_HOUR_DEDUCTION: "delete-approve-store-hour-deductions",
  DISPATCH_RECORD: "delete-approve-dispatches",
  REVENUE_RECORD: "delete-approve-revenue-records",
};

export type DeletionPerformResult = {
  /** 目標資料已不存在（例如調度重新上傳覆蓋），視為刪除目的已達成 */
  alreadyAbsent: boolean;
};

/** 將同目標的待審刪除申請標記為已核准（避免幽靈申請卡住） */
export async function resolvePendingDeletionRequests(
  targetType: DeletionRequestTargetType,
  targetIds: string | string[],
  opts?: { reviewedByUsername?: string | null; reason?: string }
): Promise<number> {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  if (ids.length === 0) return 0;
  const result = await prisma.deletionRequest.updateMany({
    where: {
      targetType,
      targetId: { in: ids },
      status: "PENDING",
    },
    data: {
      status: "APPROVED",
      reviewedByUsername: opts?.reviewedByUsername ?? null,
      reviewedAt: new Date(),
      ...(opts?.reason ? { reason: opts.reason } : {}),
    },
  });
  return result.count;
}

export async function performDeletionForTarget(
  targetType: DeletionRequestTargetType,
  targetId: string,
  changedByUsername: string | null
): Promise<DeletionPerformResult> {
  switch (targetType) {
    case "CONTENT_ENTRY": {
      const existing = await prisma.contentEntry.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!existing) return { alreadyAbsent: true };
      await prisma.contentEntry.delete({ where: { id: targetId } });
      return { alreadyAbsent: false };
    }
    case "WORKHOUR_ADJUSTMENT": {
      const existing = await prisma.workhourAdjustment.findUnique({
        where: { id: targetId },
        select: { workDate: true },
      });
      if (!existing) return { alreadyAbsent: true };
      const deleted = await prisma.workhourAdjustment.delete({ where: { id: targetId } });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return { alreadyAbsent: false };
    }
    case "STORE": {
      const existing = await prisma.store.findUnique({
        where: { id: targetId },
        select: { id: true, isActive: true },
      });
      if (!existing) return { alreadyAbsent: true };
      if (!existing.isActive) return { alreadyAbsent: true };
      await prisma.$transaction(async (tx) => {
        await deactivateStoreWithLog(tx, targetId, changedByUsername);
      });
      return { alreadyAbsent: false };
    }
    case "STORE_HOUR_DEDUCTION": {
      const existing = await prisma.storeHourDeduction.findUnique({
        where: { id: targetId },
        select: { workDate: true },
      });
      if (!existing) return { alreadyAbsent: true };
      const deleted = await prisma.storeHourDeduction.delete({ where: { id: targetId } });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return { alreadyAbsent: false };
    }
    case "DISPATCH_RECORD": {
      const existing = await prisma.dispatchRecord.findUnique({
        where: { id: targetId },
        select: { workDate: true },
      });
      if (!existing) return { alreadyAbsent: true };
      const deleted = await prisma.dispatchRecord.delete({ where: { id: targetId } });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return { alreadyAbsent: false };
    }
    case "REVENUE_RECORD": {
      const existing = await prisma.revenueRecord.findUnique({
        where: { id: targetId },
        select: { revenueDate: true },
      });
      if (!existing) return { alreadyAbsent: true };
      const deleted = await prisma.revenueRecord.delete({ where: { id: targetId } });
      await performanceEngineService.recalculateDailyPerformance(deleted.revenueDate);
      return { alreadyAbsent: false };
    }
  }
}
