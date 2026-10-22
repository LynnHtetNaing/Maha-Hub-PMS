-- NOTE: already applied by hand to LIVE (wragaoglvksbbgmfjyzp) only. STAGING never had these functions. Do not run elsewhere. See docs/security/SECURITY_STATUS.md
-- Development/test containment for legacy EDC RPCs.
-- IMPORTANT: This deliberately disables legacy EDC write/admin RPCs because
-- maha_edc_public_submit stores PAN and CVC/CVV in the database.
-- Do not promote this migration to production until the frontend is migrated
-- to a PCI-compliant payment-provider tokenization flow and regression-tested.
REVOKE EXECUTE ON FUNCTION public.maha_edc_keyed(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maha_edc_list(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maha_edc_public_submit(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maha_edc_put(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maha_edc_wipe(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maha_init(text) FROM PUBLIC, anon, authenticated;

-- Keep only the public EDC status lookup callable; it returns no card number/CVC.
GRANT EXECUTE ON FUNCTION public.maha_edc_public_get(text) TO anon, authenticated;
