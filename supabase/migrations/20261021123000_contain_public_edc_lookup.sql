-- Contain the legacy EDC public lookup while the card-entry flow is disabled.
-- This endpoint returned the full metadata JSON to unauthenticated callers.
-- Re-enable only after replacing it with a minimal, allowlisted public response.
REVOKE EXECUTE ON FUNCTION public.maha_edc_public_get(text) FROM PUBLIC, anon, authenticated;
