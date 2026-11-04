-- Provider Sales records: only a platform admin can read or write, no hotel and nobody anonymous, nothing is deleted for real.
-- Assertions only; run after 20261105_032_sales_records.sql.
DO $$
DECLARE
  p record;
  seen int := 0;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.maha_sales_records'::regclass) THEN
    RAISE EXCEPTION 'row-level security must be on for maha_sales_records';
  END IF;
  IF has_table_privilege('anon', 'public.maha_sales_records', 'select')
     OR has_table_privilege('anon', 'public.maha_sales_records', 'insert')
     OR has_table_privilege('public', 'public.maha_sales_records', 'select') THEN
    RAISE EXCEPTION 'anonymous users must have no access to maha_sales_records';
  END IF;
  IF has_table_privilege('authenticated', 'public.maha_sales_records', 'delete') THEN
    RAISE EXCEPTION 'records are marked deleted, never removed: no delete right';
  END IF;
  FOR p IN
    SELECT pol.polname,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS check_expr
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.maha_sales_records'::regclass
  LOOP
    seen := seen + 1;
    IF (p.using_expr || p.check_expr) NOT LIKE '%maha_is_platform_admin%' OR (p.using_expr || p.check_expr) LIKE '%maha_can_access_property%' THEN
      RAISE EXCEPTION 'policy % must allow a platform admin only', p.polname;
    END IF;
  END LOOP;
  IF seen <> 3 THEN
    RAISE EXCEPTION 'expected 3 policies on maha_sales_records (select, insert, update), found %', seen;
  END IF;
END $$;
