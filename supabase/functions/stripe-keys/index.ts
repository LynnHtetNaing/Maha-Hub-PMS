// Supabase Edge Function: stripe-keys
// Reads and writes Stripe keys from the one place they are now kept - maha_stripe_keys - instead of the hotel's
// own synced record (plain text, read by anyone with access to that hotel's data) or the browser's local storage
// (not even synced across devices). Two purposes, never mixed:
//   purpose "billing" - Maha Hub's own account that collects every hotel's subscription payment ("Maha Pay" to a
//                        hotel). Always the one platform row; property_code must be omitted; platform admin only.
//   purpose "guest"   - a hotel's own account (or the platform/"helper" fallback) that collects ITS guests' / OTA
//                       agents' card payments. Per-hotel when property_code is given, else the platform row.
//   POST { action, purpose, property_code? }
//     get_status  -> { ok:1, configured, publishable, connectAccountId, helperServer } - never the secret key.
//     get_secret  -> same, plus { secret } - only for someone who may already write this hotel (or the platform
//                    admin for the platform row); kept only so the existing Stripe Checkout call from the PMS
//                    still works until that call itself moves server-side.
//     set         -> { label?, publishable?, secret?, connectAccountId?, helperServer? } - upserts the row.
//     clear       -> removes the row (a hotel falls back to the platform's own keys).
//   property_code given: that hotel's own row (purpose must be "guest"; the caller must be able to write it, or
//                        read it for get_status). property_code omitted: the one platform row for that purpose -
//                        the caller must be the platform admin, always.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MAHA_ALLOWED_ORIGIN (optional).
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log a secret key, and never return one to anyone but an authorized write caller via get_secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [...new Set([
  "https://maha-hub.com", "https://www.maha-hub.com", "https://solutions.maha-hub.com", "https://pms.maha-hub.com", "https://console.maha-hub.com",
  ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean),
])];
const cors = (req: Request): Record<string, string> => {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clip = (s: unknown, n: number) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const SB = Deno.env.get("SUPABASE_URL"), ANON = Deno.env.get("SUPABASE_ANON_KEY"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB || !ANON || !SERVICE) return json(req, { error: "not_configured" }, 503);

  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json(req, { error: "not_signed_in" }, 401);
  const userClient = createClient(SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u || !u.user) return json(req, { error: "not_signed_in" }, 401);

  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const action = clip(b.action, 20);
  if (!["get_status", "get_secret", "set", "clear"].includes(action)) return json(req, { error: "bad_request" }, 400);
  const purpose = clip(b.purpose, 10) === "billing" ? "billing" : "guest";
  const code = clip(b.property_code, 40);
  if (purpose === "billing" && code) return json(req, { error: "bad_request" }, 400);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  let propertyId: string | null = null;
  if (code) {
    const { data: prop } = await userClient.from("maha_properties").select("id").eq("property_code", code).maybeSingle();
    if (!prop) return json(req, { error: "property_access_denied" }, 403);
    propertyId = prop.id;
    const needWrite = action === "set" || action === "clear" || action === "get_secret";
    if (needWrite) {
      const { data: canWrite } = await userClient.rpc("maha_can_write_property", { target_property: propertyId });
      if (canWrite !== true) return json(req, { error: "property_access_denied" }, 403);
    } else {
      const { data: canRead } = await userClient.rpc("maha_can_access_property", { target_property: propertyId });
      if (canRead !== true) return json(req, { error: "property_access_denied" }, 403);
    }
  } else {
    const { data: isAdmin } = await userClient.rpc("maha_is_platform_admin");
    if (isAdmin !== true) return json(req, { error: "property_access_denied" }, 403);
  }

  const row = async () => {
    const q = admin.from("maha_stripe_keys").select("*").eq("purpose", purpose);
    const { data } = propertyId ? await q.eq("property_id", propertyId).maybeSingle() : await q.is("property_id", null).maybeSingle();
    return data;
  };

  if (action === "get_status" || action === "get_secret") {
    const r = await row();
    const out: Record<string, unknown> = {
      sent: 1, configured: !!(r && (r.secret_key || "").trim()),
      publishable: (r && r.publishable_key) || "", connectAccountId: (r && r.connect_account_id) || "",
      helperServer: (r && r.helper_server) || "", label: (r && r.label) || "",
    };
    if (action === "get_secret") out.secret = (r && r.secret_key) || "";
    return json(req, out);
  }

  if (action === "clear") {
    const q = admin.from("maha_stripe_keys").delete().eq("purpose", purpose);
    await (propertyId ? q.eq("property_id", propertyId) : q.is("property_id", null));
    return json(req, { sent: 1 });
  }

  // set
  const patch = {
    purpose, property_id: propertyId, label: clip(b.label, 60), publishable_key: clip(b.publishable, 300),
    secret_key: clip(b.secret, 300), connect_account_id: clip(b.connectAccountId, 120), helper_server: clip(b.helperServer, 300),
    updated_at: new Date().toISOString(), updated_by: u.user.id,
  };
  const existing = await row();
  const { error } = existing
    ? await admin.from("maha_stripe_keys").update(patch).eq("id", (existing as any).id)
    : await admin.from("maha_stripe_keys").insert(patch);
  if (error) return json(req, { error: "send_failed" }, 502);
  return json(req, { sent: 1 });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
