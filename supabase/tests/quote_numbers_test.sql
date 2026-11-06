-- Quotation numbers: MH + country + year/month + running number, given by the database, each country and month on its own, gapless.
-- Assertions only; run after 20261107_039_quote_numbers.sql in the SQL editor of the project. Everything is rolled back at the end.
begin;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.maha_quote_numbers', 'select') OR has_table_privilege('authenticated', 'public.maha_quote_numbers', 'select')
     OR has_table_privilege('authenticated', 'public.maha_quote_free', 'insert') THEN
    RAISE EXCEPTION 'the quotation counters must be touched only by the function';
  END IF;
  IF has_function_privilege('anon', 'public.maha_claim_quote_no(text, text, date)', 'execute') THEN
    RAISE EXCEPTION 'an anonymous visitor must not be able to take quotation numbers';
  END IF;
END $$;
DO $$
DECLARE a text; b text; a2 text; c text; d text; e text; f text;
BEGIN
  a  := public.maha_claim_quote_no('test-q1', 'TH', date '2099-11-05');
  b  := public.maha_claim_quote_no('test-q2', 'TH', date '2099-11-30');
  a2 := public.maha_claim_quote_no('test-q1', 'TH', date '2099-11-05');          -- the same quotation again
  c  := public.maha_claim_quote_no('test-q3', 'VN', date '2099-11-06');          -- another country counts on its own
  d  := public.maha_claim_quote_no('test-q4', 'TH', date '2099-12-01');          -- a new month starts at 001
  IF a <> 'MH-TH2099/11/001' THEN RAISE EXCEPTION 'first of the month must be 001, got %', a; END IF;
  IF b <> 'MH-TH2099/11/002' THEN RAISE EXCEPTION 'second must be 002, got %', b; END IF;
  IF a2 <> a THEN RAISE EXCEPTION 'the same quotation must get the same number, got %', a2; END IF;
  IF c <> 'MH-VN2099/11/001' THEN RAISE EXCEPTION 'each country counts on its own, got %', c; END IF;
  IF d <> 'MH-TH2099/12/001' THEN RAISE EXCEPTION 'a new month starts at 001, got %', d; END IF;
  -- test-q1 moves to Cambodia: its 001 of Thailand is free again and the next Thai quotation takes it
  e := public.maha_claim_quote_no('test-q1', 'KH', date '2099-11-05');
  f := public.maha_claim_quote_no('test-q5', 'TH', date '2099-11-07');
  IF e <> 'MH-KH2099/11/001' THEN RAISE EXCEPTION 'a moved quotation takes the next number of its new country, got %', e; END IF;
  IF f <> 'MH-TH2099/11/001' THEN RAISE EXCEPTION 'the free number must be used again (no gap), got %', f; END IF;
  BEGIN
    PERFORM public.maha_claim_quote_no('test-q6', 'T', date '2099-11-05');
    RAISE EXCEPTION 'a bad country code must be refused';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
END $$;
rollback;   -- the numbers above were only a test: nothing is kept
