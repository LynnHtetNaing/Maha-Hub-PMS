// Supabase Edge Function: maha-be-mail
// Sends the Booking Engine's own guest-facing mail - confirmation (with a receipt line once paid) -
// with no PMS sign-in at all, same Brevo account and noreply@maha-hub.com sender pms-send-mail
// already uses, just reached from the public booking page instead of an authenticated PMS session.
//   POST { property_code, request_id, kind: 'confirmation' }
//     -> { sent: 1 } - looks the request up itself (by id + property), builds the mail from the
//        request's own stored facts, never anything the browser sends beyond which request to mail.
// Logged in maha_pms_mail_log the same way pms-send-mail already logs everything else, sent_by null
// (no signed-in person - the guest booked it themselves).
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY (the same ones
// pms-send-mail and crm-send-mail already use). Optional: PMS_MAIL_FROM, PMS_MAIL_FROM_NAME.
// Deploy with JWT verification off (--no-verify-jwt).
// Never log the guest's address, name or the mail body.

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
const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const clip = (s: unknown, n: number) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function mailHtml(hotelName: string, r: any): string {
  const FOREST = "#0A3020", GOLD = "#D49A38", INK = "#1f2d36", MUTED = "#5b6a73";
  const paid = r.payment_status === "paid";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 14px;background:#f7f9f8;font-size:12.5px;color:${MUTED};border-bottom:1px solid #eef1ef;white-space:nowrap">${esc(label)}</td><td style="padding:8px 14px;font-size:13.5px;font-weight:600;border-bottom:1px solid #eef1ef">${esc(value)}</td></tr>`;
  const rows = [
    row("Room", r.room_type + " · " + r.rate_code),
    row("Stay", r.arr + " – " + r.dep),
    row("Guests", r.adults + " adult(s)" + (r.children ? ", " + r.children + " child(ren)" : "")),
    row("Total", r.currency + " " + Number(r.amount).toFixed(2)),
    paid ? row("Deposit paid now", r.deposit_currency + " " + Number(r.deposit_amount).toFixed(2)) : "",
  ].filter(Boolean).join("");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${FOREST};padding:16px 28px"><span style="color:#fff;font-weight:bold;font-size:18px;letter-spacing:2px">MAHA HUB</span></td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0 0 4px">Dear ${esc(r.guest_name)},</p>
<p style="margin:0 0 18px">Thank you for booking with <b>${esc(hotelName)}</b>. Your reservation is confirmed${paid ? ", and your deposit payment was received" : ""}.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;border:1px solid #e3e8e5;border-radius:10px;overflow:hidden">${rows}</table>
<p style="margin:22px 0 0">We look forward to welcoming you.<br>${esc(hotelName)}</p>
</td></tr>
<tr><td style="background:#faf5ec;padding:14px 28px;color:#7a7468;font-size:12px">This is an automatic message from Maha Hub on behalf of ${esc(hotelName)}. Please do not reply to it.</td></tr>
</table></td></tr></table></body></html>`;
}

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const SB = Deno.env.get("SUPABASE_URL"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const BREVO = (Deno.env.get("BREVO_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!SB || !SERVICE || !BREVO) return json(req, { error: "not_configured" }, 503);

  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const code = clip(b.property_code, 40), requestId = clip(b.request_id, 80);
  if (!code || !isUuid(requestId)) return json(req, { error: "bad_request" }, 400);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: prop } = await admin.from("maha_properties").select("id,name").eq("property_code", code).maybeSingle();
  if (!prop) return json(req, { error: "property_not_found" }, 404);
  const { data: r } = await admin.from("maha_booking_requests").select("*").eq("id", requestId).eq("property_id", prop.id).maybeSingle();
  if (!r) return json(req, { error: "request_not_found" }, 404);
  if (r.status !== "confirmed") return json(req, { error: "not_confirmed" }, 409);

  const FROM = { name: Deno.env.get("PMS_MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("PMS_MAIL_FROM") || "noreply@maha-hub.com" };
  const hotelName = clip(prop.name, 120) || "Your hotel";
  const subject = `Booking confirmed - ${hotelName}`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: FROM, to: [{ email: r.guest_email }], subject, htmlContent: mailHtml(hotelName, r), tags: ["booking-engine-confirmation"] }),
  });
  const out = await res.json().catch(() => ({}));
  await admin.from("maha_pms_mail_log").insert({
    property_id: prop.id, sent_by: null, sent_by_name: "Booking Engine", to_email: r.guest_email, subject, doc: "be-confirmation", rsvn: "",
    status: res.ok ? "sent" : "failed", error: res.ok ? "" : clip(out?.message || res.status, 120),
  });
  if (!res.ok) return json(req, { error: "send_failed" }, 502);
  return json(req, { sent: 1 });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
