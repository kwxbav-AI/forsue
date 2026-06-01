DO $$
BEGIN
  BEGIN
    ALTER TYPE "DeletionRequestTargetType" ADD VALUE 'REVENUE_RECORD';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
