-- Company Sales team: members are listed only by the trusted server, the records are open to the active team and the provider only.
-- Assertions only; run after 20261105_033_crm_team.sql.
DO $$
DECLARE
  p record;
  seen int := 0;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.maha_crm_members'::regclass) THEN
    RAISE EXCEPTION 'row-level security must be on for maha_crm_members';
  END IF;
  IF has_table_privilege('anon', 'public.maha_crm_members', 'select') OR has_table_privilege('public', 'public.maha_crm_members', 'select') THEN
    RAISE EXCEPTION 'anonymous users must have no access to maha_crm_members';
  END IF;
  IF has_table_privilege('authenticated', 'public.maha_crm_members', 'insert')
     OR has_table_privilege('authenticated', 'public.maha_crm_members', 'update')
     OR has_table_privilege('authenticated', 'public.maha_crm_members', 'delete') THEN
    RAISE EXCEPTION 'a browser must never add, change or remove a team member: only the trusted server does';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.maha_is_crm_member()', 'execute')
     OR has_function_privilege('anon', 'public.maha_is_crm_member()', 'execute') THEN
    RAISE EXCEPTION 'maha_is_crm_member must be callable by signed-in users only';
  END IF;
  FOR p IN
    SELECT pol.polname,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS check_expr
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.maha_sales_records'::regclass
  LOOP
    seen := seen + 1;
    IF (p.using_expr || p.check_expr) NOT LIKE '%maha_is_crm_member%'
       OR (p.using_expr || p.check_expr) NOT LIKE '%maha_is_platform_admin%'
       OR (p.using_expr || p.check_expr) LIKE '%maha_can_access_property%' THEN
      RAISE EXCEPTION 'policy % must allow only the active sales team and the provider', p.polname;
    END IF;
  END LOOP;
  IF seen <> 3 THEN
    RAISE EXCEPTION 'expected 3 policies on maha_sales_records, found %', seen;
  END IF;
END $$;
