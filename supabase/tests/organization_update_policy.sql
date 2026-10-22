-- Regression check: organization updates must use the common org-admin
-- predicate, which enforces owner session/MFA rules and active org-admin membership.
-- Run in a test project; this script performs assertions only.
DO $$
DECLARE
  using_expr text;
  check_expr text;
BEGIN
  SELECT pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid)
    INTO using_expr, check_expr
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'maha_organizations'
    AND pol.polname = 'maha_organizations_update_admin'
    AND pol.polcmd = 'w';

  IF using_expr IS NULL OR check_expr IS NULL THEN
    RAISE EXCEPTION 'organization update policy missing USING/WITH CHECK';
  END IF;

  IF using_expr NOT LIKE '%maha_is_org_admin%' OR check_expr NOT LIKE '%maha_is_org_admin%' THEN
    RAISE EXCEPTION 'organization update policy must use maha_is_org_admin in both clauses';
  END IF;

  IF using_expr LIKE '%owner_user_id%' OR check_expr LIKE '%owner_user_id%' THEN
    RAISE EXCEPTION 'organization update policy contains a direct owner bypass';
  END IF;
END $$;
