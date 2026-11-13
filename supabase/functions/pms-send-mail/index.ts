// Supabase Edge Function: pms-send-mail
// Sends a hotel's booking confirmation (made in the PMS) to its guest through Maha Mail (Brevo).
//   POST { property_code, to, subject?, data, rsvn? }
//   - data holds the facts of the booking (hotel, guest, stay, price, policies, requests); the mail itself is built here by _shared/confirmation-mail.ts,
//     so the browser can never put its own markup into the mail;
//   - the person must be signed in and allowed to write to that hotel (the same check the PMS cloud uses);
//   - one guest address per call; no attachment;
//   - a no-reply mail from the Maha Hub brand: the hotel name and the hotel address are not the sender, and there is no reply address;
//   - each send is recorded in maha_pms_mail_log (who, to whom, which reservation, the result); at most 40 mails an hour per person.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY (the same ones crm-send-mail uses).
// Optional: PMS_MAIL_FROM (default noreply@maha-hub.com; Brevo must trust that sender or the whole maha-hub.com domain), PMS_MAIL_FROM_NAME (default Maha Hub), MAHA_ALLOWED_ORIGIN.
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log addresses, subjects, message text or keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanConfirmation, confirmationMail, confirmationSubject } from "../_shared/confirmation-mail.ts";

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

const validEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);
const clip = (s: unknown, n: number) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);
const HOURLY_LIMIT = 40;

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const SB = Deno.env.get("SUPABASE_URL"), ANON = Deno.env.get("SUPABASE_ANON_KEY"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const BREVO = (Deno.env.get("BREVO_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!SB || !ANON || !SERVICE || !BREVO) return json(req, { error: "not_configured" }, 503);

  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json(req, { error: "not_signed_in" }, 401);
  const userClient = createClient(SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u || !u.user) return json(req, { error: "not_signed_in" }, 401);

  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const code = clip(b.property_code, 40).trim(), to = clip(b.to, 254).trim().toLowerCase();
  if (!code || !validEmail(to) || !b.data || typeof b.data !== "object") return json(req, { error: "bad_request" }, 400);
  const c = cleanConfirmation(b.data);
  if (!c.hotel.name || !c.booking.arrLabel) return json(req, { error: "bad_request" }, 400);
  const subject = clip(b.subject, 200).trim() || confirmationSubject(c);

  /* the hotel, and the right to write to it (the same rule the PMS cloud uses; an unknown and a forbidden hotel look the same) */
  const { data: prop } = await userClient.from("maha_properties").select("id").eq("property_code", code).maybeSingle();
  if (!prop) return json(req, { error: "property_access_denied" }, 403);
  const { data: canWrite } = await userClient.rpc("maha_can_write_property", { target_property: prop.id });
  if (canWrite !== true) return json(req, { error: "property_access_denied" }, 403);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from("maha_pms_mail_log").select("id", { count: "exact", head: true }).eq("sent_by", u.user.id).gte("created_at", since);
  if ((count || 0) >= HOURLY_LIMIT) return json(req, { error: "too_many" }, 429);

  const { html, text } = confirmationMail(c);
  const FROM = { name: Deno.env.get("PMS_MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("PMS_MAIL_FROM") || "noreply@maha-hub.com" };
  const rsvn = clip(b.rsvn, 40);

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html, textContent: text, tags: ["pms-confirmation"] }),
  });
  const out = await res.json().catch(() => ({}));
  await admin.from("maha_pms_mail_log").insert({
    property_id: prop.id, sent_by: u.user.id, sent_by_name: clip(u.user.email, 80), to_email: to, subject, doc: "confirmation", rsvn,
    status: res.ok ? "sent" : "failed", error: res.ok ? "" : clip(out?.message || res.status, 120),
  });
  if (!res.ok) return json(req, { error: "send_failed" }, 502);
  return json(req, { sent: 1 });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
