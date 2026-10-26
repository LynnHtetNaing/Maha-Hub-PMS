-- Disposable, transaction-scoped tenant isolation regression test.
-- Run only against a development/test Supabase project with at least 3 existing
-- auth.users. The transaction is rolled back; no test fixture rows should persist.
-- This validates SECURITY DEFINER RPC guards and helper predicates. It does NOT
-- replace REST/PostgREST tests run with real user JWTs or RLS acceptance tests.
BEGIN;

DO $test$
DECLARE
  u1 uuid; u2 uuid; u3 uuid;
  org1 uuid := gen_random_uuid(); org2 uuid := gen_random_uuid();
  prop1 uuid := gen_random_uuid(); prop2 uuid := gen_random_uuid();
  denied boolean;
BEGIN
  SELECT id INTO u1 FROM auth.users ORDER BY created_at, id LIMIT 1 OFFSET 0;
  SELECT id INTO u2 FROM auth.users ORDER BY created_at, id LIMIT 1 OFFSET 1;
  SELECT id INTO u3 FROM auth.users ORDER BY created_at, id LIMIT 1 OFFSET 2;
  IF u1 IS NULL OR u2 IS NULL OR u3 IS NULL THEN
    RAISE EXCEPTION 'Test requires at least three disposable auth users';
  END IF;

  INSERT INTO public.maha_organizations(id,name,owner_user_id) VALUES
    (org1,'TEMP_SECURITY_TEST_A',u1),(org2,'TEMP_SECURITY_TEST_B',u2);
  INSERT INTO public.maha_properties(id,organization_id,name,property_code) VALUES
    (prop1,org1,'TEMP_SECURITY_HOTEL_A','SECTESTA'),
    (prop2,org2,'TEMP_SECURITY_HOTEL_B','SECTESTB');
  INSERT INTO public.maha_memberships(organization_id,property_id,user_id,role,active)
    VALUES (org1,prop1,u3,'read_only',true);
  INSERT INTO public.maha_records(property_id,collection,rec_key,data,deleted,version,seq,updated_by)
    VALUES (prop2,'security_test','cross-tenant-probe',jsonb_build_object('marker','secret-B'),false,1,1,u2);

  -- Owner A may access Hotel A, but not Hotel B.
  PERFORM set_config('request.jwt.claim.sub',u1::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1::text,'role','authenticated','aal','aal2')::text,true);
  IF public.maha_can_access_property(prop1) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: owner A own property'; END IF;
  IF public.maha_can_access_property(prop2) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: owner A cross-property read'; END IF;
  IF public.maha_can_write_property(prop2) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: owner A cross-property write'; END IF;

  denied := false;
  BEGIN
    PERFORM public.maha_sync_pull(prop2,0,10);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: maha_sync_pull did not deny cross-tenant read'; END IF;

  denied := false;
  BEGIN
    PERFORM public.maha_sync_push(prop2,jsonb_build_array(jsonb_build_object(
      'collection','security_test','key','cross-tenant-probe','base_version',1,
      'data',jsonb_build_object('marker','tampered'))));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: maha_sync_push did not deny cross-tenant write'; END IF;

  -- Owner B may access Hotel B, but not Hotel A.
  PERFORM set_config('request.jwt.claim.sub',u2::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2::text,'role','authenticated','aal','aal2')::text,true);
  IF public.maha_can_access_property(prop2) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: owner B own property'; END IF;
  IF public.maha_can_access_property(prop1) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: owner B cross-property read'; END IF;

  -- Read-only staff can read the assigned property, but cannot write or access Hotel B.
  PERFORM set_config('request.jwt.claim.sub',u3::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u3::text,'role','authenticated','aal','aal1')::text,true);
  IF public.maha_can_access_property(prop1) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: read-only assigned read'; END IF;
  IF public.maha_can_write_property(prop1) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: read-only assigned write'; END IF;
  IF public.maha_can_access_property(prop2) IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: staff cross-property read'; END IF;

  denied := false;
  BEGIN
    PERFORM public.maha_sync_push(prop1,jsonb_build_array(jsonb_build_object(
      'collection','security_test','key','readonly-probe','base_version',0,
      'data',jsonb_build_object('marker','should-not-write'))));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: sync push did not deny read-only staff write'; END IF;
  RAISE NOTICE 'PASS: tenant helper checks and sync RPC authorization checks';
END
$test$;

ROLLBACK;
