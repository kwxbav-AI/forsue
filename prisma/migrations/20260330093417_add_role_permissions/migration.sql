-- CreateEnum
CREATE TYPE "PermissionPatternKind" AS ENUM ('PAGE', 'API');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'STORE_STAFF';

-- CreateTable
CREATE TABLE "PermissionModule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionModuleApiPattern" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "kind" "PermissionPatternKind" NOT NULL,
    "pathPattern" TEXT NOT NULL,
    "method" TEXT,

    CONSTRAINT "PermissionModuleApiPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionModule_key_key" ON "PermissionModule"("key");

-- CreateIndex
CREATE INDEX "PermissionModuleApiPattern_moduleId_kind_idx" ON "PermissionModuleApiPattern"("moduleId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionModuleApiPattern_moduleId_kind_pathPattern_method_key" ON "PermissionModuleApiPattern"("moduleId", "kind", "pathPattern", "method");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_moduleId_key" ON "RolePermission"("role", "moduleId");

-- AddForeignKey
ALTER TABLE "PermissionModuleApiPattern" ADD CONSTRAINT "PermissionModuleApiPattern_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PermissionModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PermissionModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
