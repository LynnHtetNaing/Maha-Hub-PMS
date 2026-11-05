// Supabase Edge Function: auth-email-hook
// The "Send Email" Auth Hook: Supabase calls this function for every email it would send (sign-in code, set-password / user-creation link, ...).
// It builds that system's own email (Maha PMS for hotels, Maha Provider for the provider side, Maha CRM for the company sales) and sends it through Resend.
// Secrets: SEND_EMAIL_HOOK_SECRET (the "v1,whsec_..." value Supabase shows when the hook is created), RESEND_API_KEY (a sending-only Resend key),
//          AUTH_MAIL_FROM (the sender, for example "Maha Hub <no-reply@maha-hub.com>", an address verified in Resend), SUPABASE_URL (set by Supabase).
// Deploy with JWT verification off (--no-verify-jwt): Supabase signs the call (Standard Webhooks) and this function checks the signature itself.
// Never log email addresses, codes or links.

import { build } from "./render.mjs";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function verified(req: Request, body: string): Promise<boolean> {
  const secret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "").replace(/^whsec_/, "");
  const id = req.headers.get("webhook-id") || "", ts = req.headers.get("webhook-timestamp") || "", sigs = req.headers.get("webhook-signature") || "";
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;      // a call older than 5 minutes is not accepted
  const key = await crypto.subtle.importKey("raw", b64(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mine = toB64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return sigs.split(" ").some((s) => same(s.replace(/^v1,/, ""), mine));
}

const fail = (code: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: code, message } }), { status: code, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return fail(405, "method_not_allowed");
    const body = await req.text();
    if (!(await verified(req, body))) return fail(401, "bad_signature");
    const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("AUTH_MAIL_FROM"), base = Deno.env.get("SUPABASE_URL");
    if (!key || !from || !base) return fail(503, "not_configured");
    let payload: unknown; try { payload = JSON.parse(body); } catch { return fail(400, "bad_request"); }
    const m = build(payload as never, base);
    if (!m.to) return fail(400, "no_recipient");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, tags: [{ name: "system", value: m.system }] }),
    });
    if (!r.ok) { console.log("resend_refused", r.status); return fail(r.status === 429 ? 429 : 502, r.status === 429 ? "over_email_send_rate_limit" : "email_failed"); }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  } catch {
    return fail(500, "server_error");
  }
});
