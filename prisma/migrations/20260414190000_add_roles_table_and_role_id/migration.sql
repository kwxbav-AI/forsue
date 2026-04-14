-- CreateTable
CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_key_key" ON "Role"("key");

-- Extend AppUser / RolePermission with roleId
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
CREATE INDEX IF NOT EXISTS "AppUser_roleId_idx" ON "AppUser"("roleId");

ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- Foreign keys (nullable during transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AppUser_roleId_fkey'
  ) THEN
    ALTER TABLE "AppUser"
      ADD CONSTRAINT "AppUser_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_roleId_fkey'
  ) THEN
    ALTER TABLE "RolePermission"
      ADD CONSTRAINT "RolePermission_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed default roles if missing
INSERT INTO "Role" ("id", "key", "name", "isActive", "createdAt", "updatedAt")
SELECT
  v.key,
  v.key,
  v.name,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('ADMIN', '管理員'),
    ('EDITOR', '編輯者'),
    ('VIEWER', '檢視者'),
    ('STORE_STAFF', '門市人員')
) AS v(key, name)
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."key" = v.key);

-- Backfill AppUser.roleId from legacy enum column "role"
UPDATE "AppUser" u
SET "roleId" = r."id"
FROM "Role" r
WHERE u."roleId" IS NULL AND r."key" = u."role"::text;

-- Backfill RolePermission.roleId from legacy enum column "role"
UPDATE "RolePermission" rp
SET "roleId" = r."id"
FROM "Role" r
WHERE rp."roleId" IS NULL AND r."key" = rp."role"::text;

