// Supabase Edge Function: pms-send-mail
// Sends mail for a hotel through Maha Mail (Brevo), from the PMS.
//   POST { property_code, to, subject?, rsvn?, ...one of: }
//     data: {...}            the booking confirmation (built by _shared/confirmation-mail.ts from the booking facts);
//     doc: { title, html }   any printed document (Tax Invoice, Credit Note, Deposit, Reservation confirmation): a short message plus
//                            a "View <title>" link, so the guest opens, prints or saves it themselves. The link reuses the same
//                            secure, token-based page the CRM already sends quotations with (crm.maha-hub.com/d/<token>, 90 days);
//                            doc.html must already be a complete, self-contained page (its own <style>, no outside file to load).
//   - the person must be signed in and allowed to write to that hotel (the same check the PMS cloud uses);
//   - one guest address per call; no attachment;
//   - a no-reply mail from the Maha Hub brand: the hotel name and the hotel address are not the sender, and there is no reply address;
//   - each send is recorded in maha_pms_mail_log (who, to whom, which reservation, the result); at most 40 mails an hour per person.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY (the same ones crm-send-mail uses).
// Optional: PMS_MAIL_FROM (default noreply@maha-hub.com; Brevo must trust that sender or the whole maha-hub.com domain), PMS_MAIL_FROM_NAME (default Maha Hub),
//           PMS_DOC_BASE (default https://crm.maha-hub.com/d/, the same link style the CRM already uses), MAHA_ALLOWED_ORIGIN.
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log addresses, subjects, message text or keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanConfirmation, confirmationMail, confirmationSubject, esc } from "../_shared/confirmation-mail.ts";

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
const DOC_HTML_MAX = 600_000;   // the shared-document table accepts up to 6,000,000; one document stays far under that

/* the short branded mail for a document link: Maha Hub header, the hotel's name, one line, a View button */
function docMailHtml(hotelName: string, docTitle: string, link: string): string {
  const FOREST = "#0A3020", GOLD = "#D49A38", INK = "#1f2d36", MUTED = "#5b6a73";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${FOREST};padding:18px 28px;color:#fff;font-weight:bold;font-size:18px;letter-spacing:2px">MAHA HUB</td></tr>
<tr><td style="padding:26px 28px"><div style="font-size:18px;font-weight:bold;color:${FOREST};margin-bottom:10px">${esc(docTitle)}</div>
<p style="margin:0 0 20px;color:${INK}">Please find your ${esc(docTitle).toLowerCase()} from ${esc(hotelName)} using the link below. You can view, print or save it.</p>
<a href="${esc(link)}" target="_blank" style="display:inline-block;padding:12px 24px;border-radius:999px;font-weight:bold;font-size:14px;text-decoration:none;background:${GOLD};color:#1a272f">View ${esc(docTitle)}</a>
<p style="margin:22px 0 0;color:${MUTED};font-size:13px">If the button does not work, copy this link into your browser:<br>${esc(link)}</p></td></tr>
<tr><td style="background:#faf5ec;padding:14px 28px;color:#7a7468;font-size:12px">This is an automatic message from Maha Hub on behalf of ${esc(hotelName)}. Please do not reply to it.</td></tr>
</table></td></tr></table></body></html>`;
}

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
  const code = clip(b.property_code, 40).trim(), to = clip(b.to, 254).trim().toLowerCase(), rsvn = clip(b.rsvn, 40);
  if (!code || !validEmail(to)) return json(req, { error: "bad_request" }, 400);

  /* the hotel, and the right to write to it (the same rule the PMS cloud uses; an unknown and a forbidden hotel look the same) */
  const { data: prop } = await userClient.from("maha_properties").select("id,name").eq("property_code", code).maybeSingle();
  if (!prop) return json(req, { error: "property_access_denied" }, 403);
  const { data: canWrite } = await userClient.rpc("maha_can_write_property", { target_property: prop.id });
  if (canWrite !== true) return json(req, { error: "property_access_denied" }, 403);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from("maha_pms_mail_log").select("id", { count: "exact", head: true }).eq("sent_by", u.user.id).gte("created_at", since);
  if ((count || 0) >= HOURLY_LIMIT) return json(req, { error: "too_many" }, 429);

  const FROM = { name: Deno.env.get("PMS_MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("PMS_MAIL_FROM") || "noreply@maha-hub.com" };
  const send = async (subject: string, html: string, text: string, docName: string) => {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html, textContent: text, tags: ["pms-" + (docName === "confirmation" ? "confirmation" : "document")] }),
    });
    const out = await res.json().catch(() => ({}));
    await admin.from("maha_pms_mail_log").insert({
      property_id: prop.id, sent_by: u.user.id, sent_by_name: clip(u.user.email, 80), to_email: to, subject, doc: docName, rsvn,
      status: res.ok ? "sent" : "failed", error: res.ok ? "" : clip(out?.message || res.status, 120),
    });
    return res.ok;
  };

  /* a document already shown in a print preview (Tax Invoice, Credit Note, Deposit, Reservation confirmation, ...): a shared, token-only link, same as the CRM already uses for quotations */
  if (b.doc && typeof b.doc === "object") {
    const docTitle = clip(b.doc.title, 160).trim() || "Document";
    const docHtml = String(b.doc.html || "");
    if (!docHtml.trim() || docHtml.length > DOC_HTML_MAX) return json(req, { error: "bad_request" }, 400);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { error: insErr } = await admin.from("maha_shared_docs").insert({ token, title: docTitle, html: docHtml, created_by: u.user.id });
    if (insErr) { await send(clip(b.subject, 200).trim() || docTitle, "", "", docTitle); return json(req, { error: "send_failed" }, 502); }
    const link = (Deno.env.get("PMS_DOC_BASE") || "https://crm.maha-hub.com/d/") + token;
    const hotelName = clip(prop.name, 120) || "Your hotel";
    const subject = clip(b.subject, 200).trim() || (docTitle + " from " + hotelName);
    const ok = await send(subject, docMailHtml(hotelName, docTitle, link),
      `${hotelName}\n\nPlease find your ${docTitle.toLowerCase()} using the link below. You can view, print or save it.\n\n${docTitle}: ${link}\n\nThis is an automatic message from Maha Hub on behalf of ${hotelName}. Please do not reply to it.`, docTitle);
    if (!ok) return json(req, { error: "send_failed" }, 502);
    return json(req, { sent: 1, link });
  }

  /* the booking confirmation: built here from the booking facts only, so the browser can never put its own markup into the mail */
  if (!b.data || typeof b.data !== "object") return json(req, { error: "bad_request" }, 400);
  const c = cleanConfirmation(b.data);
  if (!c.hotel.name || !c.booking.arrLabel) return json(req, { error: "bad_request" }, 400);
  const subject = clip(b.subject, 200).trim() || confirmationSubject(c);
  const { html, text } = confirmationMail(c);
  const ok = await send(subject, html, text, "confirmation");
  if (!ok) return json(req, { error: "send_failed" }, 502);
  return json(req, { sent: 1 });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
