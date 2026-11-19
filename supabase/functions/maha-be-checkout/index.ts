// Supabase Edge Function: maha-be-checkout
// The Booking Engine's own Stripe Checkout, for a guest with no PMS sign-in at all - a sibling of
// stripe-guest-pay, not a replacement: that one is staff-initiated (an authenticated PMS session
// charging a guest's card on their behalf); this one is guest-initiated (the guest pays themselves,
// on Stripe's own hosted page, for a request they just submitted through the Booking Engine). Both
// read the SAME maha_stripe_keys row (purpose 'guest') - a hotel sets its Stripe keys up once, in
// one place, and both the front desk and the public booking page use them.
//   POST { action: 'create', property_code, request_id, success_url, cancel_url }
//     -> { url, session_id } - a real Stripe Checkout Session for exactly this request's deposit
//        due (read server-side from maha_be_deposit_due, never trusted from the browser).
//   POST { action: 'verify', property_code, request_id, session_id }
//     -> { paid: boolean } - re-asks Stripe directly whether that session is really paid, and if so
//        calls maha_be_mark_paid itself so the request becomes a real, materialisable reservation.
// The request's own id is treated as its bearer token (same pattern every anonymous Booking Engine
// RPC already uses): it is a random UUID the guest only has because they just submitted this
// request, never guessable, never listable.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MAHA_ALLOWED_ORIGIN (optional).
// Deploy with JWT verification off (--no-verify-jwt): there is no PMS sign-in to check here at all.
// Never log the secret key, any card data, or a guest's personal details.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [...new Set([
  "https://maha-hub.com", "https://www.maha-hub.com", "https://solutions.maha-hub.com", "https://pms.maha-hub.com", "https://console.maha-hub.com",
  ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean),
])];
const cors = (req: Request): Record<string, string> => {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "*",
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
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const SB = Deno.env.get("SUPABASE_URL"), ANON = Deno.env.get("SUPABASE_ANON_KEY"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB || !ANON || !SERVICE) return json(req, { error: "not_configured" }, 503);

  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const action = clip(b.action, 10);
  if (!["create", "verify"].includes(action)) return json(req, { error: "bad_request" }, 400);
  const code = clip(b.property_code, 40), requestId = clip(b.request_id, 80);
  if (!code || !isUuid(requestId)) return json(req, { error: "bad_request" }, 400);

  const anon = createClient(SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const propId: string | null = await anon.rpc("maha_property_id_for_code", { p_code: code }).then((r: any) => r.data || null).catch(() => null);
  if (!propId) return json(req, { error: "property_not_found" }, 404);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: reqRow } = await admin.from("maha_booking_requests").select("id,property_id,amount,currency,deposit_amount,deposit_currency,guest_name,status,payment_status,stripe_session_id")
    .eq("id", requestId).eq("property_id", propId).maybeSingle();
  if (!reqRow) return json(req, { error: "request_not_found" }, 404);

  const { data: key } = await admin.from("maha_stripe_keys").select("secret_key").eq("purpose", "guest").eq("property_id", propId).maybeSingle();
  const secret = (key && key.secret_key || "").trim();
  if (!secret) return json(req, { error: "not_configured" }, 503);

  if (action === "verify") {
    const sid = clip(b.session_id, 80) || reqRow.stripe_session_id;
    if (!sid || !/^cs_/.test(sid)) return json(req, { error: "bad_request" }, 400);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid), { headers: { Authorization: "Bearer " + secret } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: "send_failed" }, 502);
    const paid = data.payment_status === "paid" || data.status === "complete";
    if (paid && reqRow.status === "pending" && reqRow.payment_status === "awaiting") {
      const { error } = await admin.rpc("maha_be_mark_paid", { p_request: requestId, p_session_id: sid });
      if (error) return json(req, { paid: true, confirmed: false });
    }
    return json(req, { paid, confirmed: paid });
  }

  // create: the amount is always read from the request's own stored deposit_amount - never from
  // anything the browser sends, so a guest can never choose to pay less (or more) than what was
  // actually quoted and held.
  if (reqRow.status !== "pending" || reqRow.payment_status !== "awaiting") return json(req, { error: "not_awaiting" }, 409);
  const amount = Number(reqRow.deposit_amount) || 0;
  const cur = (reqRow.deposit_currency || reqRow.currency || "USD").toLowerCase();
  if (!(amount > 0)) return json(req, { error: "bad_request" }, 400);

  const successUrl = clip(b.success_url, 400) || "";
  const cancelUrl = clip(b.cancel_url, 400) || "";
  if (!/^https?:\/\//.test(successUrl) || !/^https?:\/\//.test(cancelUrl)) return json(req, { error: "bad_request" }, 400);

  const body = new URLSearchParams();
  const set = (k: string, v: unknown) => { if (v != null && v !== "") body.append(k, String(v)); };
  set("mode", "payment");
  set("success_url", successUrl + (successUrl.includes("?") ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}");
  set("cancel_url", cancelUrl);
  set("payment_method_types[0]", "card");
  set("line_items[0][quantity]", "1");
  set("line_items[0][price_data][currency]", cur);
  set("line_items[0][price_data][unit_amount]", String(unitAmount(amount, cur)));
  set("line_items[0][price_data][product_data][name]", "Booking deposit");
  set("metadata[request_id]", requestId);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(req, { error: "send_failed" }, 502);
  await admin.from("maha_booking_requests").update({ stripe_session_id: data.id }).eq("id", requestId);
  return json(req, { url: data.url, session_id: data.id });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
