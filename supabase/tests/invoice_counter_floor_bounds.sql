-- Run against a disposable development/test project.
-- Uses the existing test owner/property, simulates AAL2 claims, and rolls back.
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
    PERFORM public.maha_issue_invoice_no('64607811-1ed9-4404-a4b8-a6283578fcdf', 1000000001);
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_issue_invoice_no did not reject oversized floor'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.maha_issue_invoice_number('64607811-1ed9-4404-a4b8-a6283578fcdf', '2026-10', 1, 1000000001);
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_issue_invoice_number did not reject oversized floor'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.maha_issue_invoice_ref('64607811-1ed9-4404-a4b8-a6283578fcdf', '2026-10', 1, 1000000001);
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_issue_invoice_ref did not reject oversized floor'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.maha_lease_numbers('64607811-1ed9-4404-a4b8-a6283578fcdf', 'invoice_gapless', 1000000001, 1);
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'maha_lease_numbers did not reject oversized floor'; END IF;
END $$;
ROLLBACK;
