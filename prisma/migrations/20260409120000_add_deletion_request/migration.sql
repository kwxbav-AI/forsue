-- CreateEnum
CREATE TYPE "DeletionRequestTargetType" AS ENUM ('CONTENT_ENTRY', 'WORKHOUR_ADJUSTMENT', 'STORE');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "targetType" "DeletionRequestTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedByUserId" TEXT,
    "requestedByUsername" TEXT,
    "reviewedByUsername" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeletionRequest_targetType_targetId_idx" ON "DeletionRequest"("targetType", "targetId");
