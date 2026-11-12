// Supabase Edge Function: crm-reply
// A hotel answers an Enewletter from the email: a button (the Event invitation: "Yes, I will come" / "Sorry, I cannot come"; "I am interested"),
// or a LIVE CALENDAR (the Gentle reminder and the Meeting request: the hotel sees the free times and chooses one).
// The link is  https://crm.maha-hub.com/r/<token>  (the Worker shows the page, this function does the work).
//   GET  ?t=<token>                          -> { ok, kind, label, title, hotel, done, what }   what the page shows first
//   GET  ?t=<token>&av=1&from=YYYY-MM-DD     -> { ok, days: { "2026-12-05": ["09:00", "10:30", ...] }, today, open }   the free times, worked out live
//   POST { t, note? }                        -> { ok }   records the answer once (a second click does nothing new)
//   POST { t, slot: { date, time }, note? }  -> { ok } or 409 slot_taken   the chosen time is checked again, so two hotels never get the same time
// What an answer makes: a "reply" record (listed under Enewletter > Replies); "Yes" of an event or a chosen meeting time = a Meeting in the CRM;
// a chosen call time = a Follow up for that day; the time becomes Busy in the Google Calendar (_shared/gcal.ts).
// The token is signed (MAIL_LINK_SECRET) and holds everything needed, so nobody can change the hotel, the time options or the choice. It lasts 60 days.
// Free times: _shared/slots.ts (opening hours, 1 hour 30 minutes between meetings). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_LINK_SECRET.
// Deploy with JWT verification off (--no-verify-jwt). Never log tokens, addresses or notes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CALL_MIN, GAP_MIN, MEET_MIN, clashes, startOf, upsertEvent } from "../_shared/gcal.ts";
import { AHEAD, DAYS, OPEN, STEP, freeSlots, hhmm, isFree } from "../_shared/slots.ts";

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
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;

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

  let token = "", note = "", slot: { date: string; time: string } | null = null;
  const url = new URL(req.url);
  if (req.method === "GET") token = url.searchParams.get("t") || "";
  else if (req.method === "POST") {
    let b: { t?: unknown; note?: unknown; slot?: { date?: unknown; time?: unknown } } = {};
    try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
    token = typeof b.t === "string" ? b.t : ""; note = str(b.note, 500).trim();
    if (b.slot && DATE.test(str(b.slot.date, 10)) && TIME.test(str(b.slot.time, 5))) slot = { date: str(b.slot.date, 10), time: str(b.slot.time, 5) };
  } else return json(req, { error: "method_not_allowed" }, 405);

  const p = await open(token);
  if (!p) return json(req, { error: "link_not_valid" }, 400);
  const id = "rp_" + (await sha(token)).slice(0, 24);
  const book = (p.k === "book" || p.k === "bookm") && p.o === "book", what: "call" | "meeting" = p.k === "bookm" ? "meeting" : "call";
  const { data: had } = await admin.from("maha_sales_records").select("id").eq("id", id).maybeSingle();

  if (req.method === "GET") {
    if (url.searchParams.get("av") === "1") {
      if (!book || had) return json(req, { ok: true, days: {}, done: !!had });
      const from = DATE.test(url.searchParams.get("from") || "") ? url.searchParams.get("from")! : new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const days = await freeSlots(admin, from, Math.min(Math.max(Number(url.searchParams.get("days")) || 21, 1), 42), what);
      return json(req, { ok: true, days, today: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), ahead: AHEAD, open: { from: hhmm(OPEN.from), to: hhmm(OPEN.to), step: STEP, days: [...DAYS] }, len: what === "meeting" ? MEET_MIN : CALL_MIN });
    }
    return json(req, { ok: true, kind: book ? "book" : "answer", what, label: str(p.l, 120), title: str(p.d?.title || p.s, 160), hotel: str(p.n, 120), done: !!had });
  }
  if (had) return json(req, { ok: true, done: true });   // a second click: nothing new
  if (book && !slot) return json(req, { error: "choose_a_time" }, 400);
  if (p.h === "test") return json(req, { ok: true, done: false });   // a link of a test mail: nothing is recorded

  const now = new Date().toISOString(), day = now.slice(0, 10);
  /* the time of a meeting or a call: from the link (an event) or chosen on the calendar */
  const d: Record<string, string> = book && slot ? { ...(p.d || {}), date: slot.date, time: slot.time } : (p.d || {});
  const wantsMeeting = (p.k === "event" && p.o === "yes") || (book && what === "meeting"), wantsCall = (p.k === "remind" && /^s\d$/.test(p.o)) || (book && what === "call");
  const timed = (wantsMeeting || wantsCall) && DATE.test(String(d.date || "")) && TIME.test(String(d.time || ""));
  if (timed) {
    const len = wantsMeeting ? MEET_MIN : CALL_MIN, gap = wantsMeeting ? GAP_MIN : 0, s = startOf(d.date, d.time), e = s + len * 60000;
    if (book) {
      if (!(await isFree(admin, d.date, d.time, what))) return json(req, { error: "slot_taken" }, 409);
    } else {
      /* a meeting starts at least 1 hour 30 minutes after the start of another; a call only must not fall on one */
      const { data: same } = await admin.from("maha_sales_records").select("id,data").eq("kind", "act").eq("deleted", false).filter("data->>date", "eq", d.date);
      const busyHere = (same || []).some((r: { id: string; data: Record<string, unknown> }) => {
        const a = r.data || {};
        if (!(a.meeting === true || a.type === "Meeting") || !TIME.test(String(a.time || "")) || ["Reject", "No Show", "Cancelled"].includes(String(a.meetStatus || ""))) return false;
        const s2 = startOf(String(a.date), String(a.time));
        return (s < s2 + MEET_MIN * 60000 && s2 < e) || (gap > 0 && Math.abs(s - s2) < gap * 60000);
      });
      let busyGoogle = false;
      try { busyGoogle = (await clashes(s, e, gap)).length > 0; } catch { /* Google not reachable: the CRM check above still counts */ }
      if (busyHere || busyGoogle) return json(req, { error: "slot_taken" }, 409);
    }
  }

  const rows: { id: string; kind: string; deleted: boolean; data: Record<string, unknown> }[] = [];
  const label = book && slot ? "Chose " + slot.date + " " + slot.time : str(p.l, 120);
  rows.push({ id, kind: "reply", deleted: false, data: {
    id, kind: "reply", hotelId: str(p.h, 80), hotelName: str(p.n, 120), email: str(p.e, 254), tpl: str(p.t, 60), subject: str(p.s, 200),
    choice: str(p.o, 20), label, note, at: now, updated: now, source: "click", owner: str(p.w, 80),
  } });
  if (timed && wantsMeeting) {
    const mid = "rm_" + id.slice(3);
    rows.push({ id: mid, kind: "act", deleted: false, data: {
      id: mid, kind: "act", hotelId: str(p.h, 80), type: "Meeting", date: str(d.date, 10), time: str(d.time, 5),
      summary: str((book ? "Chose this time on the calendar: " : "Accepted the invitation: ") + (d.title || p.s) + (d.place ? " (" + d.place + ")" : "") + (note ? ". " + note : ""), 500),
      contactEmail: str(p.e, 254), meeting: true, meetStatus: "On Process", owner: str(p.w, 80), done: true, source: "Enewletter reply", updated: now,
    } });
  } else if (timed && wantsCall) {
    const fid = "rf_" + id.slice(3);
    rows.push({ id: fid, kind: "act", deleted: false, data: {
      id: fid, kind: "act", hotelId: str(p.h, 80), type: "Call", date: day, nextDate: str(d.date, 10), nextTime: str(d.time, 5),
      summary: str("Asked to be called on " + (d.date || "") + (d.time ? " at " + d.time : "") + (note ? ". " + note : ""), 500),
      contactEmail: str(p.e, 254), owner: str(p.w, 80), done: false, source: "Enewletter reply", updated: now,
    } });
  }
  const { error } = await admin.from("maha_sales_records").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) return json(req, { error: "save_failed" }, 500);
  /* the time becomes Busy in the Google Calendar */
  if (timed && rows[1]) {
    const s = startOf(d.date, d.time), len = wantsMeeting ? MEET_MIN : CALL_MIN;
    try { await upsertEvent(rows[1].id, { title: (wantsMeeting ? "Meeting: " : "Call: ") + str(p.n, 80), description: str(d.title || p.s, 200) + (note ? "\n" + note : ""), startMs: s, endMs: s + len * 60000 }); } catch { /* the CRM record is saved; the calendar can be added by the CRM later */ }
  }
  return json(req, { ok: true, done: false });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
