DO $$
BEGIN
  IF NOT public.maha_payload_has_forbidden_keys('{"v":{"secret":"sk_test_example"}}'::jsonb) THEN RAISE EXCEPTION 'nested non-empty secret was not blocked'; END IF;
  IF NOT public.maha_payload_has_forbidden_keys('{"v":{"secret_key":"private"}}'::jsonb) THEN RAISE EXCEPTION 'nested secret_key was not blocked'; END IF;
  IF NOT public.maha_payload_has_forbidden_keys('{"payment":{"card":{"cvc":"123"}}}'::jsonb) THEN RAISE EXCEPTION 'nested CVC was not blocked'; END IF;
  IF public.maha_payload_has_forbidden_keys('{"v":{"secret":""},"display_name":"Stripe"}'::jsonb) THEN RAISE EXCEPTION 'empty secret placeholder should remain compatible'; END IF;
  IF public.maha_payload_has_forbidden_keys('{"guest":{"name":"Test Guest"},"room":{"number":"101"}}'::jsonb) THEN RAISE EXCEPTION 'ordinary PMS payload incorrectly rejected'; END IF;
END $$;
