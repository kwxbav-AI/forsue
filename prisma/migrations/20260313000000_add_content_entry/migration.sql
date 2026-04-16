-- CreateTable
CREATE TABLE "ContentEntry" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "branch" TEXT NOT NULL,
    "totalArticles" INTEGER,
    "contentDesc1" TEXT,
    "articleUrl1" TEXT,
    "productCount1" INTEGER,
    "commentCount1" INTEGER,
    "contentDesc2" TEXT,
    "articleUrl2" TEXT,
    "productCount2" INTEGER,
    "commentCount2" INTEGER,
    "contentDesc3" TEXT,
    "articleUrl3" TEXT,
    "productCount3" INTEGER,
    "commentCount3" INTEGER,
    "deductedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentEntry_workDate_idx" ON "ContentEntry"("workDate");

-- CreateIndex
CREATE INDEX "ContentEntry_workDate_branch_idx" ON "ContentEntry"("workDate", "branch");
