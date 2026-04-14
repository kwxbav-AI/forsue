-- Fix: ensure RolePermission(roleId, moduleId) has a unique constraint/index
-- This is required for Prisma `upsert(where: { roleId_moduleId: ... })`.

-- 1) Remove duplicates that would block creating a unique index.
-- Keep the newest row (updatedAt/createdAt) per (roleId, moduleId).
DELETE FROM "RolePermission" rp
USING "RolePermission" dup
WHERE rp."roleId" IS NOT NULL
  AND dup."roleId" IS NOT NULL
  AND rp."roleId" = dup."roleId"
  AND rp."moduleId" = dup."moduleId"
  AND rp.ctid <> dup.ctid
  AND (
    rp."updatedAt" < dup."updatedAt"
    OR (rp."updatedAt" = dup."updatedAt" AND rp."createdAt" < dup."createdAt")
    OR (rp."updatedAt" = dup."updatedAt" AND rp."createdAt" = dup."createdAt" AND rp.ctid < dup.ctid)
  );

-- 2) Create unique index if missing.
-- Unique index satisfies Prisma upsert requirement (unique or exclusion constraint).
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_moduleId_key"
  ON "RolePermission" ("roleId", "moduleId");

