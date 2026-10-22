-- Detect non-empty nested credentials even when sync records wrap their payload
-- in a "v" field (e.g. { "v": { "secret": "..." } }).
CREATE OR REPLACE FUNCTION public.maha_payload_has_forbidden_keys(node jsonb, parent_key text DEFAULT ''::text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  item record;
BEGIN
  IF node IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(node) = 'object' THEN
    FOR item IN SELECT key, value FROM jsonb_each(node)
    LOOP
      IF lower(item.key) IN ('pan', 'cvc', 'cvv', 'cardvault', 'session') THEN
        RETURN true;
      END IF;
      IF lower(item.key) = 'secret'
         AND (lower(parent_key) = 'stripe' OR nullif(btrim(item.value #>> '{}'), '') IS NOT NULL) THEN
        RETURN true;
      END IF;
      IF lower(item.key) IN ('secret_key', 'api_secret', 'private_key', 'client_secret')
         AND nullif(btrim(item.value #>> '{}'), '') IS NOT NULL THEN
        RETURN true;
      END IF;
      IF public.maha_payload_has_forbidden_keys(item.value, item.key) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(node) = 'array' THEN
    FOR item IN SELECT element AS value FROM jsonb_array_elements(node) AS arr(element)
    LOOP
      IF public.maha_payload_has_forbidden_keys(item.value, parent_key) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$function$;
