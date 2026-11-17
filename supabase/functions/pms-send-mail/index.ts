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
// A Tax Invoice / Credit Note / Deposit page embeds the hotel's own logo (a data: image) once per printed page, and a
// multi-page, ORIGINAL+COPY document repeats it several times, so this needs real headroom above a short mail's size.
// The shared-document table accepts up to 6,000,000; this stays comfortably under that.
const DOC_HTML_MAX = 3_000_000;

type Stay = { rsvn: string; room: string; arr: string; dep: string };

/* the guest's own reservation facts sent along with a document (Tax Invoice, Credit Note, Deposit, Guest Folio): all optional, never trusted beyond a short clip */
function cleanStay(s: unknown): Stay | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const rsvn = clip(o.rsvn, 40).trim(), room = clip(o.room, 20).trim(), arr = clip(o.arr, 40).trim(), dep = clip(o.dep, 40).trim();
  if (!rsvn && !room && !arr && !dep) return null;
  return { rsvn, room, arr, dep };
}
/* the guest-facing heading: a Guest Folio's title carries an internal " · folio N" suffix meant for the PMS screen, not the guest, so it is dropped here only -
   the document itself (its own printed heading) and the subject's own fallback keep the full title */
const mailHeadingOf = (docTitle: string): string => docTitle.replace(/\s*·\s*folio\s*\d+\s*$/i, "").trim() || docTitle;

/* the short branded mail for a document link: Maha Hub header and logo, a greeting and thank-you on the hotel's behalf, the reservation's own
   details (not an internal folio number) when given, and a rounded (not pill-shaped) View button */
function docMailHtml(hotelName: string, docTitle: string, link: string, guestName: string, stay: Stay | null): string {
  const FOREST = "#0A3020", GOLD = "#D49A38", INK = "#1f2d36", MUTED = "#5b6a73";
  const LOGO = "https://maha-hub.com/brand/maha/gate-gold.png";
  const heading = mailHeadingOf(docTitle);
  const greet = guestName ? `Dear ${esc(guestName)},` : "Dear Guest,";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 14px;background:#f7f9f8;font-size:12.5px;color:${MUTED};border-bottom:1px solid #eef1ef;white-space:nowrap">${esc(label)}</td><td style="padding:8px 14px;font-size:13.5px;font-weight:600;border-bottom:1px solid #eef1ef">${esc(value)}</td></tr>`;
  const rows = stay ? [
    stay.rsvn ? row("Reservation No.", stay.rsvn) : "",
    stay.room ? row("Room", stay.room) : "",
    (stay.arr || stay.dep) ? row("Stay", [stay.arr, stay.dep].filter(Boolean).join(" – ")) : "",
  ].filter(Boolean).join("") : "";
  const stayBox = rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;border:1px solid #e3e8e5;border-radius:10px;overflow:hidden">${rows}</table>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${FOREST};padding:16px 28px"><img src="${LOGO}" width="26" height="26" alt="" style="vertical-align:middle;margin-right:10px;border-radius:6px"><span style="vertical-align:middle;color:#fff;font-weight:bold;font-size:18px;letter-spacing:2px">MAHA HUB</span></td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0 0 4px">${greet}</p>
<p style="margin:0 0 18px;color:${INK}">Thank you for staying with <b>${esc(hotelName)}</b>. Please find your ${esc(heading).toLowerCase()} below.</p>
${stayBox}
<a href="${esc(link)}" target="_blank" style="display:inline-block;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;background:${GOLD};color:#1a272f">View ${esc(heading)}</a>
<p style="margin:22px 0 0;color:${MUTED};font-size:13px">If the button does not work, copy this link into your browser:<br>${esc(link)}</p>
<p style="margin:22px 0 0;color:${INK}">We hope to welcome you back again soon.<br>${esc(hotelName)}</p>
</td></tr>
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
    if (!docHtml.trim()) return json(req, { error: "bad_request" }, 400);
    if (docHtml.length > DOC_HTML_MAX) return json(req, { error: "doc_too_large" }, 413);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { error: insErr } = await admin.from("maha_shared_docs").insert({ token, title: docTitle, html: docHtml, created_by: u.user.id });
    if (insErr) { await send(clip(b.subject, 200).trim() || docTitle, "", "", docTitle); return json(req, { error: "send_failed" }, 502); }
    const link = (Deno.env.get("PMS_DOC_BASE") || "https://crm.maha-hub.com/d/") + token;
    const hotelName = clip(prop.name, 120) || "Your hotel";
    const guest = clip(b.guest, 120).trim(), stay = cleanStay(b.stay);
    const heading = mailHeadingOf(docTitle);
    const subject = clip(b.subject, 200).trim() || (heading + " from " + hotelName);
    const greetLine = guest ? `Dear ${guest},` : "Dear Guest,";
    const stayLines = stay ? [
      stay.rsvn ? `Reservation No.: ${stay.rsvn}` : "",
      stay.room ? `Room: ${stay.room}` : "",
      (stay.arr || stay.dep) ? `Stay: ${[stay.arr, stay.dep].filter(Boolean).join(" - ")}` : "",
    ].filter(Boolean).join("\n") + "\n\n" : "";
    const ok = await send(subject, docMailHtml(hotelName, docTitle, link, guest, stay),
      `${greetLine}\n\nThank you for staying with ${hotelName}. Please find your ${heading.toLowerCase()} using the link below. You can view, print or save it.\n\n${stayLines}${heading}: ${link}\n\nWe hope to welcome you back again soon.\n${hotelName}\n\nThis is an automatic message from Maha Hub on behalf of ${hotelName}. Please do not reply to it.`, docTitle);
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
