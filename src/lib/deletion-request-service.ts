import type { DeletionRequestTargetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { deactivateStoreWithLog } from "@/lib/store-deactivate";

export const DELETE_APPROVE_MODULE_KEY: Record<DeletionRequestTargetType, string> = {
  CONTENT_ENTRY: "delete-approve-content-entries",
  WORKHOUR_ADJUSTMENT: "delete-approve-workhour-adjustments",
  STORE: "delete-approve-stores",
};

export async function performDeletionForTarget(
  targetType: DeletionRequestTargetType,
  targetId: string,
  changedByUsername: string | null
): Promise<void> {
  switch (targetType) {
    case "CONTENT_ENTRY":
      await prisma.contentEntry.delete({ where: { id: targetId } });
      return;
    case "WORKHOUR_ADJUSTMENT": {
      const deleted = await prisma.workhourAdjustment.delete({ where: { id: targetId } });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return;
    }
    case "STORE":
      await prisma.$transaction(async (tx) => {
        await deactivateStoreWithLog(tx, targetId, changedByUsername);
      });
      return;
  }
}
