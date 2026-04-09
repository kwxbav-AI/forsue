DO $$
BEGIN
  BEGIN
    ALTER TYPE "DeletionRequestTargetType" ADD VALUE 'STORE_HOUR_DEDUCTION';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TYPE "DeletionRequestTargetType" ADD VALUE 'DISPATCH_RECORD';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

