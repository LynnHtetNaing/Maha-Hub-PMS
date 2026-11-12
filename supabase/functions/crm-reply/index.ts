// Supabase Edge Function: crm-reply
// A hotel answers an Enewletter by clicking a button in the email (the Event invitation: "Yes, I will come" / "Sorry, I cannot come";
// the Gentle reminder: a time to be called). The link is  https://crm.maha-hub.com/r/<token>  (the Worker shows the page, this function does the work).
//   GET  ?t=<token>                 -> { ok, label, title, hotel, done }   what the page shows before the hotel confirms
//   POST { t, note? }               -> { ok }   records the answer once (a second click does nothing new):
//        - a "reply" record (kind reply) the CRM lists under Enewletter > Replies
//        - Event invitation + "Yes": a Meeting in the CRM (Meetings), with the date and time of the invitation
//        - Gentle reminder + a time: a Follow up in the CRM for that day
// The token is signed (MAIL_LINK_SECRET, the same secret the unsubscribe link uses) and holds everything needed, so nothing is looked up
// by a guess and nobody can change the hotel, the time or the choice. It lasts 60 days.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_LINK_SECRET. Deploy with JWT verification off (--no-verify-jwt).
// Never log tokens, addresses or notes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGINS = [...new Set(["https://crm.maha-hub.com", ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean)])];
const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmac = async (data: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("MAIL_LINK_SECRET") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
};
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);

type Payload = { h: string; n: string; e: string; t: string; s: string; k: string; o: string; l: string; d?: Record<string, string>; w?: string; x: number };

const open = async (token: string): Promise<Payload | null> => {
  const i = token.lastIndexOf(".");
  if (i < 1 || !Deno.env.get("MAIL_LINK_SECRET")) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  if (sig !== (await hmac(body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    if (!p || typeof p.h !== "string" || typeof p.o !== "string" || !(p.x > Date.now())) return null;
    return p;
  } catch { return null; }
};

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const SB = Deno.env.get("SUPABASE_URL"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB || !SERVICE) return json(req, { error: "not_configured" }, 503);
  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  let token = "", note = "";
  if (req.method === "GET") token = new URL(req.url).searchParams.get("t") || "";
  else if (req.method === "POST") {
    let b: { t?: unknown; note?: unknown } = {};
    try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
    token = typeof b.t === "string" ? b.t : ""; note = str(b.note, 500).trim();
  } else return json(req, { error: "method_not_allowed" }, 405);

  const p = await open(token);
  if (!p) return json(req, { error: "link_not_valid" }, 400);
  const id = "rp_" + (await sha(token)).slice(0, 24);
  const { data: had } = await admin.from("maha_sales_records").select("id").eq("id", id).maybeSingle();

  if (req.method === "GET") {
    return json(req, { ok: true, label: str(p.l, 120), title: str(p.d?.title || p.s, 160), hotel: str(p.n, 120), done: !!had });
  }
  if (had) return json(req, { ok: true, done: true });   // a second click: nothing new
  if (p.h === "test") return json(req, { ok: true, done: false });   // a link of a test mail: nothing is recorded

  const now = new Date().toISOString(), day = now.slice(0, 10);
  const rows: { id: string; kind: string; deleted: boolean; data: Record<string, unknown> }[] = [];
  rows.push({ id, kind: "reply", deleted: false, data: {
    id, kind: "reply", hotelId: str(p.h, 80), hotelName: str(p.n, 120), email: str(p.e, 254), tpl: str(p.t, 60), subject: str(p.s, 200),
    choice: str(p.o, 20), label: str(p.l, 120), note, at: now, updated: now, source: "click", owner: str(p.w, 80),
  } });
  const d = p.d || {};
  if (p.k === "event" && p.o === "yes") {
    const mid = "rm_" + id.slice(3);
    rows.push({ id: mid, kind: "act", deleted: false, data: {
      id: mid, kind: "act", hotelId: str(p.h, 80), type: "Meeting", date: str(d.date, 10), time: str(d.time, 5),
      summary: str("Accepted the invitation: " + (d.title || p.s) + (d.place ? " (" + d.place + ")" : "") + (note ? ". " + note : ""), 500),
      contactEmail: str(p.e, 254), meeting: true, meetStatus: "On Process", owner: str(p.w, 80), done: true, source: "Enewletter reply", updated: now,
    } });
  } else if (p.k === "remind" && /^s\d$/.test(p.o)) {
    const fid = "rf_" + id.slice(3);
    rows.push({ id: fid, kind: "act", deleted: false, data: {
      id: fid, kind: "act", hotelId: str(p.h, 80), type: "Call", date: day, nextDate: str(d.date, 10), nextTime: str(d.time, 5),
      summary: str("Asked to be called on " + (d.date || "") + (d.time ? " at " + d.time : "") + (note ? ". " + note : ""), 500),
      contactEmail: str(p.e, 254), owner: str(p.w, 80), done: false, source: "Enewletter reply", updated: now,
    } });
  }
  const { error } = await admin.from("maha_sales_records").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) return json(req, { error: "save_failed" }, 500);
  return json(req, { ok: true, done: false });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
