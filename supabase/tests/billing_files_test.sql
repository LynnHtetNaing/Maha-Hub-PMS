-- Billing files: a hotel can only read its own files, only a platform admin can write, nobody anonymous can touch the table,
-- only PDF / PNG / JPG up to 5 MB, at most 5 files per record. Assertions only; run after 20261104_031_billing_files.sql.
DO $$
DECLARE
  p record;
  seen int := 0;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.maha_billing_files'::regclass) THEN
    RAISE EXCEPTION 'row-level security must be on for maha_billing_files';
  END IF;

  IF has_table_privilege('anon', 'public.maha_billing_files', 'select')
     OR has_table_privilege('anon', 'public.maha_billing_files', 'insert')
     OR has_table_privilege('public', 'public.maha_billing_files', 'select') THEN
    RAISE EXCEPTION 'anonymous users must have no access to maha_billing_files';
  END IF;

  FOR p IN
    SELECT pol.polname, pol.polcmd,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS check_expr
    FROM pg_policy pol
    WHERE pol.polrelid = 'public.maha_billing_files'::regclass
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
    RAISE EXCEPTION 'expected 4 policies on maha_billing_files (select, insert, update, delete), found %', seen;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.maha_billing_files'::regclass AND tgname = 'maha_billing_files_guard_trg') THEN
    RAISE EXCEPTION 'the 5-files-per-record guard is missing';
  END IF;

  IF has_function_privilege('anon', 'public.maha_billing_file_readable(text)', 'execute') THEN
    RAISE EXCEPTION 'anonymous users must not run maha_billing_file_readable';
  END IF;

  -- a path whose first folder is not a hotel id is never readable
  IF public.maha_billing_file_readable('not-a-uuid/file.pdf') THEN
    RAISE EXCEPTION 'a bad path must never be readable';
  END IF;

  -- where Storage exists: the area is private and allows only PDF, PNG and JPG up to 5 MB
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'billing-files' AND public = false AND file_size_limit = 5242880
        AND allowed_mime_types @> ARRAY['application/pdf', 'image/png', 'image/jpeg']::text[]
        AND cardinality(allowed_mime_types) = 3
    ) THEN
      RAISE EXCEPTION 'billing-files must be private, 5 MB, PDF/PNG/JPG only';
    END IF;
  END IF;
END $$;
