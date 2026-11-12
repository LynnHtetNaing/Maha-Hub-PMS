// Supabase Edge Function: crm-send-mail
// Sends email for the company CRM (crm.maha-hub.com) through Brevo, from crm@maha-hub.com:
//   POST { action: "send" | "newsletter" | "test", to: ["a@b.com"], subject, message, html?, attachment?: { name, content (base64, up to about 3 MB) }, docs?: [{ title, quoteNo?, html }], replyTo? }
//   html (newsletter / test only) is the decorated text from the CRM editor; it is cleaned (clean.mjs) and `message` stays as the plain-text version.
//     send        a quotation / MSA to a hotel (up to 10 addresses). Each document becomes a link  https://crm.maha-hub.com/d/<token>  (90 days).
//     newsletter  the Enewletter (up to 100 addresses a call). Hotels that unsubscribed are skipped, every mail has an unsubscribe link.
//     test        one test mail to the address the team member types.
//   Enewletter templates (newsletter / test): names {email: hotel name} and ids {email: hotel id} give each hotel its own greeting ({{hotel}} in the text) and,
//   with tpl { id, name, kind: "event"|"remind"|"", options: [{ k, label, data }] }, each hotel its own signed answer links (https://replace.me/<k> in the text becomes
//   https://crm.maha-hub.com/r/<token>, see crm-reply). A test mail gets links that record nothing.
//   GET  ?u=<email, base64url>&s=<signature>   the unsubscribe link: the hotel is added to maha_mail_optout.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, MAIL_LINK_SECRET (any long random text).
// Optional: MAIL_FROM (crm@maha-hub.com), MAIL_FROM_NAME (Maha Hub), MAIL_REPLY_TO, MAIL_DOC_BASE (https://crm.maha-hub.com/d/), MAHA_ALLOWED_ORIGIN.
// (one file: the cleaning code is inside, between the clean:start and clean:end lines)
// Deploy with JWT verification off (--no-verify-jwt): the function checks the signed-in person itself (an active CRM member or the provider).
// Never log addresses, subjects, message text or keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- clean:start (makes the Enewletter text safe: only what the CRM editor can make is kept)
const TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a", "img", "div", "span", "hr", "blockquote"]);
const STYLE_OK = new Set(["color", "background-color", "text-align", "font-size", "font-weight", "font-style", "text-decoration", "display", "padding", "border-radius", "max-width", "line-height", "border", "border-left", "border-top", "border-bottom", "border-right", "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "padding-top", "padding-bottom", "padding-left", "padding-right", "width", "vertical-align", "letter-spacing", "text-transform"]);
const cleanStyle = (s: any) => String(s || "").split(";").map((x: string) => {
  const i = x.indexOf(":"); if (i < 0) return "";
  const k = x.slice(0, i).trim().toLowerCase(), v = x.slice(i + 1).trim();
  return STYLE_OK.has(k) && /^[#\w\s%.,()-]{1,60}$/.test(v) && !/url|expression|javascript|import/i.test(v) ? `${k}:${v}` : "";
}).filter(Boolean).join(";");
const escAttr = (s: any) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unEnt = (s: any) => String(s).replace(/&amp;/g, "&");

function cleanHtml(input: any) {
  const L = "\u0001", G = "\u0002";
  let h = String(input || "").replace(/[\u0001\u0002]/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "");
  h = h.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g, (_m: string, close: string, tag: string, attrs: string) => {
    tag = tag.toLowerCase(); if (!TAGS.has(tag)) return "";
    if (close) return `${L}/${tag}${G}`;
    let out = "";
    for (const a of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const k = a[1].toLowerCase(), v = unEnt(a[2] ?? a[3] ?? "");
      if (k === "style") { const c = cleanStyle(v); if (c) out += ` style="${escAttr(c)}"`; }
      else if (k === "href" && tag === "a" && /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(v)) out += ` href="${escAttr(v)}"`;
      else if (k === "src" && tag === "img" && /^https:\/\/[^\s"'<>]+$/i.test(v)) out += ` src="${escAttr(v)}"`;
      else if (k === "alt" && tag === "img") out += ` alt="${escAttr(v.slice(0, 120))}"`;
      else if ((k === "width" || k === "height") && tag === "img" && /^\d{1,4}$/.test(v)) out += ` ${k}="${v}"`;
    }
    if (tag === "a") out += ` target="_blank" rel="noopener"`;
    return `${L}${tag}${out}${tag === "br" || tag === "hr" || tag === "img" ? " /" : ""}${G}`;
  });
  return h.replace(/</g, "&lt;").replace(/>/g, "&gt;").split(L).join("<").split(G).join(">");
}

const textOf = (html: any) => String(html || "").replace(/<(br|\/p|\/div|\/h[1-3]|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

const ATTACH_NAME = /^[\w .()-]{1,100}\.(pdf|png|jpe?g|docx?|xlsx?|pptx?)$/i;
const ATTACH_MAX_B64 = 4_200_000;   // about 3 MB of file
const cleanAttachment = (a: any) => a && ATTACH_NAME.test(String(a.name || "")) && /^[A-Za-z0-9+/=]+$/.test(String(a.content || "")) && String(a.content).length <= ATTACH_MAX_B64 ? { name: String(a.name), content: String(a.content) } : null;
// --- clean:end

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
  let richHtml = action !== "send" && typeof b.html === "string" && b.html.trim() ? cleanHtml(b.html.slice(0, 200000)) : "";
  const att = action !== "send" && b.attachment ? cleanAttachment(b.attachment) : null;
  if (action !== "send" && b.attachment && !att) return json(req, { error: "bad_attachment" }, 400);
  let to: string[] = [...new Set((Array.isArray(b.to) ? b.to : []).map((x: unknown) => String(x || "").trim().toLowerCase()))].filter(validEmail) as string[];
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

  /* Enewletter template: a greeting for each hotel and an answer link for each choice */
  const names: Record<string, string> = b.names && typeof b.names === "object" ? b.names : {};
  const ids: Record<string, string> = b.ids && typeof b.ids === "object" ? b.ids : {};
  const tpl = b.tpl && typeof b.tpl === "object" ? b.tpl : null;
  const opts: { k: string; label: string; data: Record<string, string> }[] = tpl && Array.isArray(tpl.options) ? tpl.options.slice(0, 6).filter((o: any) => o && /^[a-z0-9]{1,8}$/.test(String(o.k))).map((o: any) => ({ k: String(o.k), label: String(o.label || "").slice(0, 120), data: Object.fromEntries(Object.entries(o.data || {}).slice(0, 8).map(([a, v]) => [String(a).slice(0, 12), String(v).slice(0, 160)])) })) : [];
  const REPLY_BASE = Deno.env.get("MAIL_REPLY_BASE") || "https://crm.maha-hub.com/r/";
  const swap = (s: string, from: string, to: string) => s.split(from).join(to);
  const personal = (s: string, name: string, linkOf: Record<string, string>) => { let o = swap(s, "{{hotel}}", esc(name)); for (const k of Object.keys(linkOf)) o = swap(o, "https://replace.me/" + k, linkOf[k]); return o; };
  const exp = Date.now() + 60 * 86400000;
  const linksFor = async (email: string): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    if (!tpl || !opts.length || action === "send") return out;
    for (const o of opts) {
      const pay = { h: action === "test" ? "test" : String(ids[email] || "").slice(0, 80), n: String(names[email] || "").slice(0, 120), e: email, t: String(tpl.name || tpl.id || "").slice(0, 60), s: subject, k: String(tpl.kind || ""), o: o.k, l: o.label, d: o.data, w: who.slice(0, 80), x: exp };
      const body = b64url(new TextEncoder().encode(JSON.stringify(pay)));
      out[o.k] = REPLY_BASE + body + "." + (await hmac(body));
    }
    return out;
  };

  let skipped = 0;
  if (action === "newsletter") {
    const { data } = await admin.from("maha_mail_optout").select("email").in("email", to);
    const out = new Set((data || []).map((r: { email: string }) => r.email));
    skipped = to.filter((e) => out.has(e)).length; to = to.filter((e) => !out.has(e));
  }

  const FROM = { name: Deno.env.get("MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("MAIL_FROM") || "crm@maha-hub.com" };
  const replyTo = validEmail(b.replyTo) ? b.replyTo : (Deno.env.get("MAIL_REPLY_TO") || FROM.email);
  const bodyHtml = (extra: string, rich = richHtml) => rich
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:620px;margin:0 auto;border:1px solid #e3ddd0;border-radius:12px;overflow:hidden"><div style="background:#0A3020;color:#fff;padding:14px 20px;font-weight:bold;font-size:16px">${esc(FROM.name)}</div><div style="padding:20px">${rich}</div><div style="background:#faf5ec;padding:12px 20px;font-size:12px;color:#777">${esc(FOOT)}${extra}</div></div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">${esc(message).replace(/\n/g, "<br>")}${links.length ? `<p style="margin-top:20px">${links.map((l) => `<a href="${l.url}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#0A3020;color:#fff;border-radius:6px;text-decoration:none">${esc(l.title)}</a>`).join("")}</p>` : ""}<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 10px"><div style="font-size:12px;color:#777">${esc(FOOT)}${extra}</div></div>`;

  let sent = 0, failed = 0; const errors: string[] = [], log: Record<string, unknown>[] = [];
  for (const email of to) {
    let extra = "", headers: Record<string, string> | undefined;
    if (action === "newsletter") {
      const un = `${SB}/functions/v1/crm-send-mail?u=${b64url(new TextEncoder().encode(email))}&s=${await hmac(email)}`;
      extra = `<br><a href="${un}" style="color:#777">Unsubscribe</a>`; headers = { "List-Unsubscribe": `<${un}>` };
    }
    const nm = String(names[email] || (action === "test" ? "Hotel name" : "your hotel")), linkOf = await linksFor(email);
    const rich = personal(richHtml, nm, linkOf);
    const msg = personal(message, nm, linkOf).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
    const subj = personal(subject, nm, {}).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").slice(0, 200);
    const optText = opts.length ? "\n\n" + opts.filter((o) => linkOf[o.k]).map((o) => `${o.label}: ${linkOf[o.k]}`).join("\n") : "";
    const textBody = msg + optText + (links.length ? "\n\n" + links.map((l) => `${l.title}: ${l.url}`).join("\n") : "") + "\n\n" + FOOT;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email }], replyTo: { email: replyTo }, subject: subj, htmlContent: bodyHtml(extra, rich), textContent: textBody, ...(att ? { attachment: [att] } : {}), ...(headers ? { headers } : {}), tags: [`crm-${action}`] }),
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
