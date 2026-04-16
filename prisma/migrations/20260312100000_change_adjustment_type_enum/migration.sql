-- AlterEnum: replace AdjustmentType with new values (人力不足、會議/考核、儲備人力、試作、其他)
CREATE TYPE "AdjustmentType_new" AS ENUM ('STAFF_SHORTAGE', 'MEETING_REVIEW', 'RESERVE_STAFF', 'TRIAL', 'OTHER');

ALTER TABLE "WorkhourAdjustment" ADD COLUMN "adjustmentType_new" "AdjustmentType_new";
UPDATE "WorkhourAdjustment" SET "adjustmentType_new" = 'OTHER'::"AdjustmentType_new";
ALTER TABLE "WorkhourAdjustment" ALTER COLUMN "adjustmentType_new" SET NOT NULL;
ALTER TABLE "WorkhourAdjustment" DROP COLUMN "adjustmentType";
ALTER TABLE "WorkhourAdjustment" RENAME COLUMN "adjustmentType_new" TO "adjustmentType";
DROP TYPE "AdjustmentType";
ALTER TYPE "AdjustmentType_new" RENAME TO "AdjustmentType";
