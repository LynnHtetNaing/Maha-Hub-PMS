-- End-to-end database RPC validation in a disposable test project.
-- Uses a test owner/property and rolls back all successful writes.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bf8511ac-0099-4141-816c-0db1c3a70723',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"bf8511ac-0099-4141-816c-0db1c3a70723","role":"authenticated","aal":"aal2"}',true);
DO $$
DECLARE blocked boolean;
BEGIN
  blocked := false;
  BEGIN
    PERFORM public.maha_sync_push(
      '64607811-1ed9-4404-a4b8-a6283578fcdf',
      '[{"collection":"$set","key":"stripe-secret-test","base_version":0,"deleted":false,"data":{"v":{"secret":"sk_live_example"}}}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_sync_push accepted a nested non-empty secret'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.maha_save_property_cloud(
      '64607811-1ed9-4404-a4b8-a6283578fcdf',
      '{"stripe":{"secret_key":"private_example"}}'::jsonb,
      0
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_save_property_cloud accepted a nested secret_key'; END IF;

  -- Empty placeholder fields remain compatible with existing UI-shaped records.
  PERFORM public.maha_sync_push(
    '64607811-1ed9-4404-a4b8-a6283578fcdf',
    '[{"collection":"$set","key":"stripe-empty-placeholder-test","base_version":0,"deleted":false,"data":{"v":{"secret":""},"display_name":"Stripe"}}]'::jsonb
  );
END $$;
ROLLBACK;
