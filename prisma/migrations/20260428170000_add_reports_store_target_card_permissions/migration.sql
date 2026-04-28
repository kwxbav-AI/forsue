-- Default RolePermission for reports-store-target-card
-- - ADMIN / EDITOR: read+write
-- - others: unchanged (defaults to none unless configured)

DO $$
DECLARE
  module_id TEXT;
BEGIN
  SELECT "id" INTO module_id
  FROM "PermissionModule"
  WHERE "key" = 'reports-store-target-card'
  LIMIT 1;

  -- Permission modules are synced from docs/permission-modules.json via scripts/sync-permissions.cjs.
  -- If the module isn't present yet, skip (idempotent / safe in CI & deploy ordering).
  IF module_id IS NULL THEN
    RETURN;
  END IF;

  -- ADMIN
  INSERT INTO "RolePermission" ("id", "role", "roleId", "moduleId", "canRead", "canWrite", "createdAt", "updatedAt")
  SELECT md5(random()::text || clock_timestamp()::text), 'ADMIN', r."id", module_id, TRUE, TRUE, NOW(), NOW()
  FROM "Role" r
  WHERE r."key" = 'ADMIN'
  ON CONFLICT ("roleId", "moduleId")
  DO UPDATE SET "canRead" = EXCLUDED."canRead", "canWrite" = EXCLUDED."canWrite", "updatedAt" = NOW();

  -- EDITOR
  INSERT INTO "RolePermission" ("id", "role", "roleId", "moduleId", "canRead", "canWrite", "createdAt", "updatedAt")
  SELECT md5(random()::text || clock_timestamp()::text), 'EDITOR', r."id", module_id, TRUE, TRUE, NOW(), NOW()
  FROM "Role" r
  WHERE r."key" = 'EDITOR'
  ON CONFLICT ("roleId", "moduleId")
  DO UPDATE SET "canRead" = EXCLUDED."canRead", "canWrite" = EXCLUDED."canWrite", "updatedAt" = NOW();
END $$;

