-- Tax Invoice numbers: TIV + country + year/month + running number, gapless, restarts every month.
-- Assertions only; run after 20261107_038_tax_invoice_numbers.sql. Everything is rolled back at the end.
begin;
DO $$
DECLARE
  a text; b text; c text; d text; e text;
BEGIN
  IF has_table_privilege('anon', 'public.maha_billing_counters', 'select') OR has_table_privilege('authenticated', 'public.maha_billing_counters', 'select')
     OR has_table_privilege('authenticated', 'public.maha_billing_counters', 'insert') THEN
    RAISE EXCEPTION 'the invoice counters must be touched only by the functions';
  END IF;
  IF has_function_privilege('authenticated', 'public.maha_next_tax_invoice_no(text, date)', 'execute') THEN
    RAISE EXCEPTION 'a browser must not be able to take invoice numbers';
  END IF;

  a := public.maha_next_tax_invoice_no('Thailand', date '2099-11-05');
  b := public.maha_next_tax_invoice_no('Thailand', date '2099-11-30');
  c := public.maha_next_tax_invoice_no('Vietnam',  date '2099-11-06');
  d := public.maha_next_tax_invoice_no('Thailand', date '2099-12-01');
  e := public.maha_next_tax_invoice_no('', date '2099-11-07');
  IF a <> 'TIV-TH2099/11/001' THEN RAISE EXCEPTION 'first of the month must be 001, got %', a; END IF;
  IF b <> 'TIV-TH2099/11/002' THEN RAISE EXCEPTION 'second must be 002, got %', b; END IF;
  IF c <> 'TIV-VN2099/11/001' THEN RAISE EXCEPTION 'each country counts on its own, got %', c; END IF;
  IF d <> 'TIV-TH2099/12/001' THEN RAISE EXCEPTION 'a new month starts at 001, got %', d; END IF;
  IF e <> 'TIV-TH2099/11/003' THEN RAISE EXCEPTION 'an empty country is Thailand, got %', e; END IF;
  BEGIN
    PERFORM public.maha_next_tax_invoice_no('Atlantis', date '2099-11-05');
    RAISE EXCEPTION 'an unknown country must be refused';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
END $$;
rollback;   -- the numbers above were only a test: nothing is kept
