-- Security posture regression assertions for the Maha PMS test project.
-- Read-only; safe to run in development/test environments.
DO $$
DECLARE
  bad record;
BEGIN
  -- SECURITY DEFINER routines in the exposed public schema must have a fixed search_path.
  SELECT p.oid::regprocedure::text AS signature INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND (p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%'
    ))
  LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'SECURITY DEFINER function lacks fixed search_path: %', bad.signature; END IF;

  -- No SECURITY DEFINER routine should be executable anonymously in the exposed public schema.
  SELECT p.oid::regprocedure::text AS signature INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'anon can execute SECURITY DEFINER function: %', bad.signature; END IF;

  -- Internal tables must remain behind controlled server-side RPCs, not direct browser grants.
  SELECT t.table_name, g.grantee, g.privilege_type INTO bad
  FROM (VALUES
    ('maha_activity_log'), ('maha_counters'), ('maha_edc'),
    ('maha_invoice_register'), ('maha_login_challenges'), ('maha_login_identities'),
    ('maha_org_counters'), ('maha_platform_admins'), ('maha_platform_settings'),
    ('maha_property_cloud_history'), ('maha_property_seq'), ('maha_secret'),
    ('maha_trusted_devices')
  ) AS t(table_name)
  JOIN information_schema.role_table_grants g
    ON g.table_schema = 'public' AND g.table_name = t.table_name
  WHERE g.grantee IN ('anon', 'authenticated')
  LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'unexpected browser grant on internal table %.%: %', bad.table_name, bad.grantee, bad.privilege_type; END IF;

  -- Organization-row updates must flow through the MFA-aware org-admin helper.
  SELECT pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
         pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    INTO bad
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'maha_organizations'
    AND pol.polname = 'maha_organizations_update_admin' AND pol.polcmd = 'w';
  IF NOT FOUND OR bad.using_expr NOT LIKE '%maha_is_org_admin%'
     OR bad.check_expr NOT LIKE '%maha_is_org_admin%'
     OR bad.using_expr LIKE '%owner_user_id%'
     OR bad.check_expr LIKE '%owner_user_id%' THEN
    RAISE EXCEPTION 'organization update policy is missing or bypasses MFA-aware org-admin check';
  END IF;
END $$;
