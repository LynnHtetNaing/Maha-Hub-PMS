// Supabase Edge Function: stripe-guest-pay
// A hotel's own Stripe account (its own keys, kept in maha_stripe_keys, purpose "guest") collecting a payment
// from ITS OWN guest or an OTA - never Maha Hub's account, never the "billing" purpose. Two ways, both branded
// Maha Pay, never "Stripe", to whoever sees them:
//   link    - a Checkout Session link to send the guest/OTA; they enter their own card on Stripe's own page.
//             The card never reaches this server or the browser's own page at all.
//   charge  - an OTA's own Virtual Credit Card (VCC) the hotel already has: a Stripe Elements card field on the
//             page sends the card straight to Stripe and gets back a payment_method id (never the PAN/CVC) - this
//             function only ever sees that id, and uses it to charge the hotel's own account immediately.
//   POST { action: 'link'|'charge'|'status', property_code, amount, currency?, ref?, guest?, payment_method_id? (charge only), session_id? (status only) }
//     link   -> { sent:1, url, session_id } - the session_id lets the hotel check later whether the guest ever paid
//     charge -> { sent:1, ok, status }
//     status -> { paid, status } - re-asks Stripe directly (never trusts anything the browser remembers)
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MAHA_ALLOWED_ORIGIN (optional).
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log the secret key or any card data; a payment_method id is not card data (Stripe's own tokenised reference).

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
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XOF", "XAF"]);
const unitAmount = (amount: number, cur: string) => ZERO_DECIMAL.has(cur.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);

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
  const action = clip(b.action, 10);
  if (!["link", "charge", "status"].includes(action)) return json(req, { error: "bad_request" }, 400);
  const code = clip(b.property_code, 40);
  if (!code) return json(req, { error: "bad_request" }, 400);
  const amount = action === "status" ? 0 : +b.amount || 0;
  if (action !== "status" && !(amount > 0)) return json(req, { error: "bad_request" }, 400);

  const { data: prop } = await userClient.from("maha_properties").select("id,name").eq("property_code", code).maybeSingle();
  if (!prop) return json(req, { error: "property_access_denied" }, 403);
  const { data: canWrite } = await userClient.rpc("maha_can_write_property", { target_property: prop.id });
  if (canWrite !== true) return json(req, { error: "property_access_denied" }, 403);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: key } = await admin.from("maha_stripe_keys").select("secret_key").eq("purpose", "guest").eq("property_id", prop.id).maybeSingle();
  const secret = (key && key.secret_key || "").trim();
  if (!secret) return json(req, { error: "not_configured" }, 503);

  if (action === "status") {
    const sid = clip(b.session_id, 80);
    if (!sid || !/^cs_/.test(sid)) return json(req, { error: "bad_request" }, 400);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid), {
      headers: { Authorization: "Bearer " + secret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: "send_failed" }, 502);
    const paid = data.payment_status === "paid" || data.status === "complete";
    return json(req, { paid, status: data.status });
  }

  const cur = (clip(b.currency, 3) || "USD").toLowerCase();
  const ref = clip(b.ref, 60), guest = clip(b.guest, 80);
  const desc = [guest, ref].filter(Boolean).join(" · ").slice(0, 200) || clip(prop.name, 120);

  if (action === "link") {
    const base = (Deno.env.get("MAHA_PMS_BASE") || "https://pms.maha-hub.com/").replace(/\/+$/, "") + "/";
    const body = new URLSearchParams();
    const set = (k: string, v: unknown) => { if (v != null && v !== "") body.append(k, String(v)); };
    set("mode", "payment");
    set("success_url", base + "#/bill.folio?maha_pay=1");
    set("cancel_url", base + "#/bill.folio?maha_pay=cancelled");
    set("payment_method_types[0]", "card");
    set("line_items[0][quantity]", "1");
    set("line_items[0][price_data][currency]", cur);
    set("line_items[0][price_data][unit_amount]", String(unitAmount(amount, cur)));
    set("line_items[0][price_data][product_data][name]", "Maha Pay – " + (ref || "Payment"));
    set("line_items[0][price_data][product_data][description]", desc);
    set("metadata[ref]", ref);
    set("metadata[guest]", guest);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: "send_failed" }, 502);
    return json(req, { sent: 1, url: data.url, session_id: data.id });
  }

  // charge: the card was already tokenised by Stripe.js in the browser - this id, never the card itself
  const pm = clip(b.payment_method_id, 60);
  if (!pm) return json(req, { error: "bad_request" }, 400);
  const body = new URLSearchParams();
  const set = (k: string, v: unknown) => { if (v != null && v !== "") body.append(k, String(v)); };
  set("amount", String(unitAmount(amount, cur)));
  set("currency", cur);
  set("payment_method", pm);
  set("confirm", "true");
  set("off_session", "true");
  set("description", "Maha Pay – " + desc);
  set("metadata[ref]", ref);
  set("metadata[guest]", guest);
  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(req, { error: (data.error && data.error.code === "authentication_required") ? "needs_3ds" : "send_failed" }, res.status === 402 ? 402 : 502);
  return json(req, { sent: 1, ok: data.status === "succeeded", status: data.status });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
