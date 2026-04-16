import type { DeletionRequestTargetType } from "@prisma/client";

const SEGMENT_TO_TARGET: Record<string, DeletionRequestTargetType> = {
  "content-entries": "CONTENT_ENTRY",
  "workhour-adjustments": "WORKHOUR_ADJUSTMENT",
  stores: "STORE",
  "store-hour-deductions": "STORE_HOUR_DEDUCTION",
  dispatches: "DISPATCH_RECORD",
};

export function targetTypeFromSegment(segment: string): DeletionRequestTargetType | null {
  return SEGMENT_TO_TARGET[segment] ?? null;
}
