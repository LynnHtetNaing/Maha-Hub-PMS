// Supabase Edge Function: crm-send-mail
// Sends email for the company CRM (crm.maha-hub.com) through Brevo, from crm@maha-hub.com:
//   POST { action: "send" | "newsletter" | "test", to: ["a@b.com"], subject, message, docs?: [{ title, quoteNo?, html }], replyTo? }
//     send        a quotation / MSA to a hotel (up to 10 addresses). Each document becomes a link  https://crm.maha-hub.com/d/<token>  (90 days).
//     newsletter  the Enewletter (up to 100 addresses a call). Hotels that unsubscribed are skipped, every mail has an unsubscribe link.
//     test        one test mail to the address the team member types.
//   GET  ?u=<email, base64url>&s=<signature>   the unsubscribe link: the hotel is added to maha_mail_optout.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, MAIL_LINK_SECRET (any long random text).
// Optional: MAIL_FROM (crm@maha-hub.com), MAIL_FROM_NAME (Maha Hub), MAIL_REPLY_TO, MAIL_DOC_BASE (https://crm.maha-hub.com/d/), MAHA_ALLOWED_ORIGIN.
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself (an active CRM member or the provider).
// Never log addresses, subjects, message text or keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [...new Set([
  "https://crm.maha-hub.com", "https://maha-hub.com", "https://console.maha-hub.com",
  ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean),
])];
const cors = (req: Request): Record<string, string> => {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmac = async (data: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("MAIL_LINK_SECRET") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const validEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);
const FOOT = "Maha Hub Group of Companies Limited · Bangkok, Thailand (Head Office) · ph : +66 (0) 641 081 434";

const unsubscribe = async (req: Request, url: URL): Promise<Response> => {
  const u = url.searchParams.get("u") || "", s = url.searchParams.get("s") || "";
  let email = "";
  try { email = new TextDecoder().decode(fromB64url(u)).toLowerCase(); } catch { return text("This link is not valid.", 400); }
  if (!validEmail(email) || s !== (await hmac(email))) return text("This link is not valid.", 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("maha_mail_optout").upsert({ email, source: "link" });
  return text("You are unsubscribed. Maha Hub will not send you the newsletter again.");
};

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const url = new URL(req.url);
  if (req.method === "GET") return unsubscribe(req, url);
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const SB = Deno.env.get("SUPABASE_URL"), ANON = Deno.env.get("SUPABASE_ANON_KEY"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // a key pasted with a space, a line break or quotes around it still works
  const BREVO = (Deno.env.get("BREVO_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!SB || !ANON || !SERVICE || !BREVO || !Deno.env.get("MAIL_LINK_SECRET")) return json(req, { error: "not_configured" }, 503);

  /* who is asking: an active CRM member or the provider */
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u || !u.user) return json(req, { error: "not_signed_in" }, 401);
  const [m, p] = await Promise.all([userClient.rpc("maha_is_crm_member"), userClient.rpc("maha_is_platform_admin")]);
  if (m.data !== true && p.data !== true) return json(req, { error: "not_allowed" }, 403);
  const admin = createClient(SB, SERVICE);
  let who = "";
  { const { data } = await admin.from("maha_crm_members").select("name").eq("user_id", u.user.id).maybeSingle(); who = data?.name || u.user.email || ""; }

  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const action = b.action, subject = String(b.subject || "").trim().slice(0, 200), message = String(b.message || "").slice(0, 20000);
  if (!["send", "newsletter", "test"].includes(action) || !subject || !message.trim()) return json(req, { error: "bad_request" }, 400);
  let to: string[] = [...new Set((Array.isArray(b.to) ? b.to : []).map((x: unknown) => String(x || "").trim().toLowerCase()))].filter(validEmail) as string[];
  // the Enewletter (and its test) is for the provider only; a team member sends quotations
  if ((action === "newsletter" || action === "test") && p.data !== true) return json(req, { error: "provider_only" }, 403);
  const max = action === "newsletter" ? 100 : action === "send" ? 10 : 1;
  if (!to.length || to.length > max) return json(req, { error: "bad_recipients", max }, 400);

  /* the documents (quotation / MSA) become links */
  const base = Deno.env.get("MAIL_DOC_BASE") || "https://crm.maha-hub.com/d/";
  const links: { title: string; url: string }[] = [];
  if (action === "send" && Array.isArray(b.docs)) {
    for (const d of b.docs.slice(0, 3)) {
      const html = String(d?.html || ""); if (!html || html.length > 5_500_000) continue;
      const token = b64url(crypto.getRandomValues(new Uint8Array(24)));
      const { error } = await admin.from("maha_shared_docs").insert({ token, title: String(d.title || "Document").slice(0, 200), quote_no: String(d.quoteNo || "").slice(0, 60), html, created_by: u.user.id });
      if (error) return json(req, { error: "doc_failed" }, 500);
      links.push({ title: String(d.title || "Document").slice(0, 200), url: base + token });
    }
  }

  let skipped = 0;
  if (action === "newsletter") {
    const { data } = await admin.from("maha_mail_optout").select("email").in("email", to);
    const out = new Set((data || []).map((r: { email: string }) => r.email));
    skipped = to.filter((e) => out.has(e)).length; to = to.filter((e) => !out.has(e));
  }

  const FROM = { name: Deno.env.get("MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("MAIL_FROM") || "crm@maha-hub.com" };
  const replyTo = validEmail(b.replyTo) ? b.replyTo : (Deno.env.get("MAIL_REPLY_TO") || FROM.email);
  const bodyHtml = (extra: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">${esc(message).replace(/\n/g, "<br>")}${links.length ? `<p style="margin-top:20px">${links.map((l) => `<a href="${l.url}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#0A3020;color:#fff;border-radius:6px;text-decoration:none">${esc(l.title)}</a>`).join("")}</p>` : ""}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 10px"><div style="font-size:12px;color:#777">${esc(FOOT)}${extra}</div></div>`;

  let sent = 0, failed = 0; const errors: string[] = [], log: Record<string, unknown>[] = [];
  for (const email of to) {
    let extra = "", headers: Record<string, string> | undefined;
    if (action === "newsletter") {
      const un = `${SB}/functions/v1/crm-send-mail?u=${b64url(new TextEncoder().encode(email))}&s=${await hmac(email)}`;
      extra = `<br><a href="${un}" style="color:#777">Unsubscribe</a>`; headers = { "List-Unsubscribe": `<${un}>` };
    }
    const textBody = message + (links.length ? "\n\n" + links.map((l) => `${l.title}: ${l.url}`).join("\n") : "") + "\n\n" + FOOT;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email }], replyTo: { email: replyTo }, subject, htmlContent: bodyHtml(extra), textContent: textBody, ...(headers ? { headers } : {}), tags: [`crm-${action}`] }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) sent++; else { failed++; if (errors.length < 3) errors.push(String(out?.message || res.status).slice(0, 120)); }
    log.push({ sent_by: u.user.id, sent_by_name: who.slice(0, 80), to_email: email, subject, kind: action === "send" ? "quote" : action, quote_no: String(b.quoteNo || "").slice(0, 60), status: res.ok ? "sent" : "failed", error: res.ok ? "" : String(out?.message || res.status).slice(0, 200), provider_id: String(out?.messageId || "").slice(0, 120) });
  }
  if (log.length) await admin.from("maha_mail_log").insert(log);
  return json(req, { sent, failed, skipped, errors, links: links.length });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
