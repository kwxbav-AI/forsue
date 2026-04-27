-- Prevent duplicate pending requests for same target (race-condition safe)
CREATE UNIQUE INDEX "DeletionRequest_targetType_targetId_pending_unique"
ON "DeletionRequest" ("targetType", "targetId")
WHERE "status" = 'PENDING';

