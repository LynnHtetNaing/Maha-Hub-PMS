-- Prevent a browser-authenticated writer from poisoning invoice/counter sequences
-- by submitting an arbitrarily large client-provided floor. Existing test data's
-- highest counter is 1,301 and invoice number is 7; the bound is intentionally high.
DO $migration$
DECLARE fn regprocedure; def text; patched text; pattern text;
BEGIN
  pattern := 'if not public[.]maha_can_write_property\(target_property\) then[[:space:]]+raise exception ''property-write-denied'' using errcode = ''42501'';[[:space:]]+end if;';
  fn := 'public.maha_issue_invoice_no(uuid,bigint)'::regprocedure;
  def := pg_get_functiondef(fn);
  patched := regexp_replace(def, pattern, 'if not public.maha_can_write_property(target_property) then raise exception ''property-write-denied'' using errcode = ''42501''; end if; if coalesce(floor_value, 1) > 1000000000 then raise exception ''invoice-floor-out-of-range'' using errcode = ''22023''; end if;', 'i');
  IF patched = def THEN RAISE EXCEPTION 'Could not safely patch maha_issue_invoice_no'; END IF;
  EXECUTE patched;

  fn := 'public.maha_issue_invoice_number(uuid,text,bigint,bigint)'::regprocedure;
  def := pg_get_functiondef(fn);
  patched := regexp_replace(def, pattern, 'if not public.maha_can_write_property(target_property) then raise exception ''property-write-denied'' using errcode = ''42501''; end if; if coalesce(floor_no, 1) > 1000000000 or coalesce(floor_seq, 1) > 1000000000 then raise exception ''invoice-floor-out-of-range'' using errcode = ''22023''; end if;', 'i');
  IF patched = def THEN RAISE EXCEPTION 'Could not safely patch maha_issue_invoice_number'; END IF;
  EXECUTE patched;

  fn := 'public.maha_issue_invoice_ref(uuid,text,bigint,bigint)'::regprocedure;
  def := pg_get_functiondef(fn);
  patched := regexp_replace(def, pattern, 'if not public.maha_can_write_property(target_property) then raise exception ''property-write-denied'' using errcode = ''42501''; end if; if coalesce(floor_no, 1) > 1000000000 or coalesce(floor_seq, 1) > 1000000000 then raise exception ''invoice-floor-out-of-range'' using errcode = ''22023''; end if;', 'i');
  IF patched = def THEN RAISE EXCEPTION 'Could not safely patch maha_issue_invoice_ref'; END IF;
  EXECUTE patched;

  fn := 'public.maha_lease_numbers(uuid,text,bigint,integer)'::regprocedure;
  def := pg_get_functiondef(fn);
  patched := regexp_replace(def, pattern, 'if not public.maha_can_write_property(target_property) then raise exception ''property-write-denied'' using errcode = ''42501''; end if; if coalesce(floor_value, 1) > 1000000000 then raise exception ''counter-floor-out-of-range'' using errcode = ''22023''; end if;', 'i');
  IF patched = def THEN RAISE EXCEPTION 'Could not safely patch maha_lease_numbers'; END IF;
  EXECUTE patched;
END
$migration$;
