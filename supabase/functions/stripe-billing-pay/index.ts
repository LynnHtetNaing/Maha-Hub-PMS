// Supabase Edge Function: stripe-billing-pay
// Lets a hotel pay its own subscription invoice from inside the PMS - "Maha Pay" to the hotel, Stripe underneath,
// always Maha Hub's own ("billing" purpose) account in maha_stripe_keys. Nothing to set up per hotel: every
// property uses the same one platform account, the secret key never leaves this server.
//   POST { action, doc_id, session_id? }
//     create  -> { doc_id } for an open 'invoice' or 'subscription' row the caller's hotel can read; returns
//                { sent:1, url } to send the browser to (a real Stripe Checkout Session, Maha Pay branded).
//     confirm -> { doc_id, session_id } after the browser returns from Checkout; verifies the session with Stripe
//                itself (never trusts the query string alone) and, only if truly paid, marks the record paid.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MAHA_ALLOWED_ORIGIN (optional).
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log the secret key; it is read from maha_stripe_keys only inside this function, with the service role.

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

// Stripe wants the smallest currency unit (e.g. satang, cents); most currencies are x100, a few (e.g. JPY, KRW) are not.
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
  if (!["create", "confirm"].includes(action)) return json(req, { error: "bad_request" }, 400);
  const docId = clip(b.doc_id, 60);
  if (!docId) return json(req, { error: "bad_request" }, 400);

  // the caller must be able to read this hotel's own record (RLS already enforces this on the select itself)
  const { data: doc } = await userClient.from("maha_billing_docs").select("id,property_id,kind,no,amount,currency,status").eq("id", docId).maybeSingle();
  if (!doc) return json(req, { error: "property_access_denied" }, 403);
  if (!["invoice", "subscription"].includes(doc.kind)) return json(req, { error: "bad_request" }, 400);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: key } = await admin.from("maha_stripe_keys").select("secret_key").eq("purpose", "billing").is("property_id", null).maybeSingle();
  const secret = (key && key.secret_key || "").trim();
  if (!secret) return json(req, { error: "not_configured" }, 503);

  const { data: prop } = await admin.from("maha_properties").select("name").eq("id", doc.property_id).maybeSingle();
  const hotelName = clip(prop && prop.name, 120) || "Your hotel";
  const base = (Deno.env.get("MAHA_PMS_BASE") || "https://pms.maha-hub.com/").replace(/\/+$/, "") + "/";

  if (action === "create") {
    if (doc.status === "paid") return json(req, { error: "already_paid" }, 409);
    const cur = String(doc.currency || "USD").toLowerCase();
    const successUrl = base + "#/sbill.invoices?maha_pay=1&doc=" + encodeURIComponent(doc.id) + "&session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = base + "#/sbill.invoices?maha_pay=cancelled&doc=" + encodeURIComponent(doc.id);
    const body = new URLSearchParams();
    const set = (k: string, v: unknown) => { if (v != null && v !== "") body.append(k, String(v)); };
    set("mode", "payment");
    set("success_url", successUrl);
    set("cancel_url", cancelUrl);
    set("client_reference_id", doc.id);
    set("payment_method_types[0]", "card");
    set("line_items[0][quantity]", "1");
    set("line_items[0][price_data][currency]", cur);
    set("line_items[0][price_data][unit_amount]", String(unitAmount(+doc.amount || 0, doc.currency)));
    set("line_items[0][price_data][product_data][name]", "Maha Pay – " + (doc.kind === "subscription" ? "Subscription" : "Invoice") + " " + doc.no);
    set("line_items[0][price_data][product_data][description]", hotelName);
    set("metadata[doc_id]", doc.id);
    set("metadata[property_id]", doc.property_id);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(req, { error: "send_failed" }, 502);
    return json(req, { sent: 1, url: data.url });
  }

  // confirm
  const sessionId = clip(b.session_id, 120);
  if (!sessionId) return json(req, { error: "bad_request" }, 400);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
    headers: { Authorization: "Bearer " + secret },
  });
  const session = await res.json().catch(() => ({}));
  if (!res.ok) return json(req, { error: "send_failed" }, 502);
  const paid = session.payment_status === "paid" || session.status === "complete";
  if (paid && session.client_reference_id === doc.id && doc.status !== "paid") {
    await admin.from("maha_billing_docs").update({ status: "paid", paid_for: "Maha Pay" }).eq("id", doc.id);
  }
  return json(req, { sent: 1, paid: paid && session.client_reference_id === doc.id });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
