-- 部門預設工時設定：無打卡紀錄且工時為 0 時，套用此預設值
-- 台北區-福德店：2 位正職員工每日 8 小時（該店無 GPS 打卡設備）
INSERT INTO "AppSetting" (id, key, "valueJson", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'attendance.defaultWorkHours.byDepartment',
  '{"台北區-福德店": 8}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE
  SET "valueJson" = EXCLUDED."valueJson",
      "updatedAt" = NOW();
