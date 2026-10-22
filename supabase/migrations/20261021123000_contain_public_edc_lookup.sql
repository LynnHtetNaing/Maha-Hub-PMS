-- NOTE: already applied by hand to LIVE (wragaoglvksbbgmfjyzp) only. STAGING never had these functions. Do not run elsewhere. See docs/security/SECURITY_STATUS.md
-- Contain the legacy EDC public lookup while the card-entry flow is disabled.
-- This endpoint returned the full metadata JSON to unauthenticated callers.
-- Re-enable only after replacing it with a minimal, allowlisted public response.
REVOKE EXECUTE ON FUNCTION public.maha_edc_public_get(text) FROM PUBLIC, anon, authenticated;
