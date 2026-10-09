// Supabase Edge Function: tenant-cloud
// Loads/saves ONE property's cloud payload for the signed-in staff member.
// Deploy with verify_jwt=true. Secrets: SUPABASE_URL, SUPABASE_ANON_KEY.
// No service-role key is used: every call runs as the caller, so RLS and the
// maha_get/save_property_cloud RPC checks decide access. The browser sends a property
// CODE only as a lookup hint; access is decided on the server from the caller's JWT.
//
// NOTE: reconstructed from the client contract in ecosystem/index.html because the
// deployed v5 source was not in the repository. Diff against the deployed v5 before
// replacing it.
//
// Contract:
//   { action:"load", property_code }
//     -> 200 { cloud:{ version, updated_at, payload } }  | 200 { cloud:null, empty:true }
//   { action:"save", property_code, payload, expected_version }
//     -> 200 { ok:true, cloud:{ version, updated_at } }
//     -> 409 { error:"conflict", cloud:{ version, updated_at, payload } }
// Errors never include payloads, tokens or SQL text.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("MAHA_ALLOWED_ORIGIN") || "https://maha-hub.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "cloud_not_configured" }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authHeader)) return json({ error: "unauthorized" }, 401);

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const action = body.action;
  const code = typeof body.property_code === "string" ? body.property_code.trim().toUpperCase() : "";
  if ((action !== "load" && action !== "save") || !/^[A-Z0-9_-]{2,24}$/.test(code)) {
    return json({ error: "invalid_request" }, 400);
  }

  // Caller-scoped client: PostgREST applies RLS as this user.
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  // RLS only returns properties this user may access; an unknown code and a forbidden
  // code are deliberately indistinguishable. Codes are globally unique (migration 004).
  const { data: property, error: propertyError } = await db
    .from("maha_properties").select("id").eq("property_code", code).maybeSingle();
  if (propertyError) return json({ error: "lookup_failed" }, 502);
  if (!property) return json({ error: "property_access_denied" }, 403);

  const fail = (e: { code?: string } | null) => {
    switch (e?.code) {
      case "28000": return json({ error: "unauthorized" }, 401);
      case "42501": return json({ error: "property_access_denied" }, 403);
      case "22023": return json({ error: "invalid_payload" }, 400);
      default: return json({ error: "cloud_unavailable" }, 502);
    }
  };

  if (action === "load") {
    const { data, error } = await db.rpc("maha_get_property_cloud", { target_property: property.id });
    if (error) return fail(error);
    if (!data || data.empty) return json({ cloud: null, empty: true });
    return json({ cloud: { version: data.version, updated_at: data.updated_at, payload: data.payload } });
  }

  const expected = body.expected_version;
  const payload = body.payload;
  if (!Number.isInteger(expected) || (expected as number) < 0 ||
      !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ error: "invalid_request" }, 400);
  }

  const { data, error } = await db.rpc("maha_save_property_cloud", {
    target_property: property.id,
    new_payload: payload,
    expected_version: expected,
  });
  if (error) return fail(error);
  if (data?.conflict) {
    return json({ error: "conflict", cloud: { version: data.version, updated_at: data.updated_at, payload: data.payload ?? null } }, 409);
  }
  return json({ ok: true, cloud: { version: data.version, updated_at: data.updated_at } });
});
