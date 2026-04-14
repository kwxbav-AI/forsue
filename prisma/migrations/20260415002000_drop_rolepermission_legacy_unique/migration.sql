-- Fix: Custom roles share legacyRole="EDITOR", so unique(legacyRole, moduleId) breaks upsert/create.
-- We keep unique(roleId, moduleId) as the real key, and drop the legacy unique constraint/index.

-- 1) Best-effort backfill roleId for any legacy rows that are still null.
UPDATE "RolePermission" rp
SET "roleId" = rp."role"::text
WHERE rp."roleId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Role" r
    WHERE r."id" = rp."role"::text OR r."key" = rp."role"::text
  );

-- 2) Drop legacy unique constraint/index (name comes from Prisma map: RolePermission_role_moduleId_key).
ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_role_moduleId_key";
DROP INDEX IF EXISTS "RolePermission_role_moduleId_key";

