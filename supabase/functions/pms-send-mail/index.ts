// Supabase Edge Function: pms-send-mail
// Sends a hotel's reservation confirmation (written in the PMS) to its guest through Maha Mail (Brevo).
//   POST { property_code, to, subject, message, rows?: [[label, value], ...], footer?, replyTo?, rsvn? }
//   - the person must be signed in and allowed to write to that hotel (the same check the PMS cloud uses);
//   - one guest address per call; a plain letter plus an optional table of details; no attachment, no links of our own;
//   - the mail is sent in the hotel's name, replies go to the hotel's own email;
//   - each send is recorded in maha_pms_mail_log (who, to whom, which reservation, the result); at most 40 mails an hour per person.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY (the same ones crm-send-mail uses).
// Optional: PMS_MAIL_FROM (default crm@maha-hub.com, an address Brevo already trusts), MAHA_ALLOWED_ORIGIN.
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself.
// Never log addresses, subjects, message text or keys.

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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const subject = clip(b.subject, 200).trim(), message = clip(b.message, 20000);
  if (!code || !validEmail(to) || !subject || !message.trim()) return json(req, { error: "bad_request" }, 400);

  /* the hotel, and the right to write to it (the same rule the PMS cloud uses; an unknown and a forbidden hotel look the same) */
  const { data: prop } = await userClient.from("maha_properties").select("id,name").eq("property_code", code).maybeSingle();
  if (!prop) return json(req, { error: "property_access_denied" }, 403);
  const { data: canWrite } = await userClient.rpc("maha_can_write_property", { target_property: prop.id });
  if (canWrite !== true) return json(req, { error: "property_access_denied" }, 403);

  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from("maha_pms_mail_log").select("id", { count: "exact", head: true }).eq("sent_by", u.user.id).gte("created_at", since);
  if ((count || 0) >= HOURLY_LIMIT) return json(req, { error: "too_many" }, 429);

  const hotel = clip(prop.name, 120) || "Hotel";
  const rows: [string, string][] = (Array.isArray(b.rows) ? b.rows : []).slice(0, 30).map((r: unknown) => Array.isArray(r) ? [clip(r[0], 60), clip(r[1], 200)] as [string, string] : ["", ""] as [string, string]).filter((r: [string, string]) => r[0] && r[1]);
  const replyTo = validEmail(b.replyTo) ? b.replyTo : "";
  const rsvn = clip(b.rsvn, 40), footer = clip(b.footer, 600).trim();
  const FROM = { name: hotel, email: Deno.env.get("PMS_MAIL_FROM") || "crm@maha-hub.com" };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:620px;margin:0 auto;border:1px solid #e3ddd0;border-radius:12px;overflow:hidden">`
    + `<div style="background:#0A3020;color:#fff;padding:14px 20px;font-weight:bold">${esc(hotel)}</div>`
    + `<div style="padding:20px">${esc(message).replace(/\n/g, "<br>")}`
    + (rows.length ? `<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px">${rows.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;width:40%">${esc(r[0])}</td><td style="padding:6px 0;border-bottom:1px solid #eee"><b>${esc(r[1])}</b></td></tr>`).join("")}</table>` : "")
    + (footer ? `<p style="margin:18px 0 0;color:#444">${esc(footer).replace(/\n/g, "<br>")}</p>` : "") + `</div><div style="background:#faf5ec;color:#7a7468;font-size:12px;padding:10px 20px">Sent for ${esc(hotel)} through Maha Hub.</div></div>`;
  const textBody = message + (rows.length ? "\n\n" + rows.map((r) => `${r[0]}: ${r[1]}`).join("\n") : "") + (footer ? "\n\n" + footer : "") + `\n\nSent for ${hotel} through Maha Hub.`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: FROM, to: [{ email: to }], ...(replyTo ? { replyTo: { email: replyTo, name: hotel } } : {}), subject, htmlContent: html, textContent: textBody, tags: ["pms-confirmation"] }),
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
