-- Billing records: a hotel can only read its own, only a platform admin can write, nobody anonymous can touch the table.
-- Assertions only; run after 20261103_030_billing_records.sql.
DO $$
DECLARE
  p record;
  seen int := 0;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.maha_billing_docs'::regclass) THEN
    RAISE EXCEPTION 'row-level security must be on for maha_billing_docs';
  END IF;

  IF has_table_privilege('anon', 'public.maha_billing_docs', 'select')
     OR has_table_privilege('anon', 'public.maha_billing_docs', 'insert')
     OR has_table_privilege('public', 'public.maha_billing_docs', 'select') THEN
    RAISE EXCEPTION 'anonymous users must have no access to maha_billing_docs';
  END IF;

  FOR p IN
    SELECT pol.polname, pol.polcmd,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS check_expr
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.maha_billing_docs'::regclass
  LOOP
    seen := seen + 1;
    IF p.polcmd = 'r' THEN
      IF p.using_expr NOT LIKE '%maha_can_access_property%' OR p.using_expr NOT LIKE '%maha_is_platform_admin%' THEN
        RAISE EXCEPTION 'read policy must allow only the hotel''s own people or a platform admin';
      END IF;
    ELSE
      IF (p.using_expr || p.check_expr) NOT LIKE '%maha_is_platform_admin%' OR (p.using_expr || p.check_expr) LIKE '%maha_can_access_property%' THEN
        RAISE EXCEPTION 'policy % must allow writes for a platform admin only', p.polname;
      END IF;
    END IF;
  END LOOP;

  IF seen <> 4 THEN
    RAISE EXCEPTION 'expected 4 policies on maha_billing_docs (select, insert, update, delete), found %', seen;
  END IF;
END $$;
