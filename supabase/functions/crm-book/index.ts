// Supabase Edge Function: crm-book
// The booking page a customer opens (crm.maha-hub.com/book/talk, /book/demo, or the "Choose a time" button of an Enewletter /r/<token>):
// a live calendar of free times, then a short form, then a confirmation.
//   Types:  talk     "Talk with the Team"  10 minutes, a short call. No confirmation email to the customer; it is only recorded in the CRM.
//           demo     "Book a Demo"         60 minutes. A confirmation email goes to the customer (and the guests), with the calendar file.
//           meeting  "Meeting with Maha Hub" 60 minutes, from the Enewletter button. Confirmation email like the demo.
//   GET  ?type=<talk|demo>  or  ?t=<token>            -> { ok, type: { key, title, len, phone }, prefill: { email, hotel }, done }
//   GET  ... &av=1&from=YYYY-MM-DD&days=N             -> { ok, days: { "2026-12-05": ["09:00", ...] }, today, ahead, len }   the free times, worked out live
//   POST { type | t, slot: { date, time }, first, last, email, hotel, phone?, note?, guests?: [email], website? }
//        -> { ok, title, date, time, len, mailed } or 409 slot_taken (the time is checked again, so two customers never get the same time)
// What a booking makes: a Meeting (demo, meeting) or a Follow up call (talk) in the CRM for that customer (a new hotel record "New Database" when the
// customer is not known yet), and a Busy event in the Google Calendar. From an Enewletter the answer is also kept under Enewletter > Replies.
// Free times: _shared/slots.ts (opening hours; a meeting starts at least 1 hour 30 minutes after the start of another). Look: the page of the Worker.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_LINK_SECRET (only for the Enewletter link), BREVO_API_KEY (the confirmation email).
// Deploy with JWT verification off (--no-verify-jwt). Never log names, addresses, phones or notes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startOf, upsertEvent } from "../_shared/gcal.ts";
import { AHEAD, freeSlots, isFree } from "../_shared/slots.ts";

const ORIGINS = [...new Set(["https://crm.maha-hub.com", ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean)])];
const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

const TYPES: Record<string, { title: string; len: number; step: number; what: "call" | "meeting"; mail: boolean; phone: boolean }> = {
  talk: { title: "Talk with the Team", len: 10, step: 15, what: "call", mail: false, phone: true },
  demo: { title: "Book a Demo", len: 60, step: 30, what: "meeting", mail: true, phone: false },
  meeting: { title: "Meeting with Maha Hub", len: 60, step: 30, what: "meeting", mail: true, phone: false },
};

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmac = async (data: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("MAIL_LINK_SECRET") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
};
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/, EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const todayBkk = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

type Payload = { h: string; n: string; e: string; t: string; s: string; k: string; o: string; l: string; d?: Record<string, string>; w?: string; x: number };
const open = async (token: string): Promise<Payload | null> => {
  const i = token.lastIndexOf(".");
  if (i < 1 || !Deno.env.get("MAIL_LINK_SECRET")) return null;
  const body = token.slice(0, i);
  if (token.slice(i + 1) !== (await hmac(body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    return p && typeof p.h === "string" && (p.k === "book" || p.k === "bookm") && p.o === "book" && p.x > Date.now() ? p : null;
  } catch { return null; }
};

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const when = (date: string, time: string, len: number) => {
  const s = startOf(date, time), e = s + len * 60000;
  const day = new Date(s).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
  return { s, e, text: `${day}, ${hm(s)} - ${hm(e)} (Indochina Time, ICT)` };
};

/* the confirmation email (a demo or a meeting): the time, a button for Google Calendar and the calendar file */
const sendConfirmation = async (to: string[], name: string, title: string, date: string, time: string, len: number, uid: string): Promise<boolean> => {
  const KEY = (Deno.env.get("BREVO_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!KEY || !to.length) return false;
  const w = when(date, time, len), FROM = { name: Deno.env.get("MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("MAIL_FROM") || "crm@maha-hub.com" };
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title + " - Maha Hub")}&dates=${utc(w.s)}/${utc(w.e)}&details=${encodeURIComponent("Booked with Maha Hub.")}&ctz=Asia%2FBangkok`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maha Hub//Booking//EN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${uid}@maha-hub.com`, `DTSTAMP:${utc(Date.now())}`, `DTSTART:${utc(w.s)}`, `DTEND:${utc(w.e)}`,
    `SUMMARY:${title} - Maha Hub`, "DESCRIPTION:Booked with Maha Hub.", "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a272f;max-width:560px;margin:0 auto;border:1px solid #c5d0d8;border-radius:14px;overflow:hidden">`
    + `<div style="background:#0A3020;color:#fff;padding:16px 22px;font-weight:bold;font-size:17px">${esc(FROM.name)}</div><div style="padding:22px">`
    + `<h2 style="margin:0 0 8px;color:#0A3020">Your ${esc(title.toLowerCase())} is confirmed</h2><p>Dear ${esc(name)},</p><p>Thank you for booking with Maha Hub. We look forward to meeting you.</p>`
    + `<div style="background:#FBF3E0;border-radius:10px;padding:14px 16px;margin:14px 0"><b>${esc(title)}</b><br>${esc(w.text)}<br>${len} minutes</div>`
    + `<p><a href="${gcal}" style="display:inline-block;background:#D49A38;color:#1a272f;padding:11px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Add to Google Calendar</a></p>`
    + `<p style="color:#556470">The calendar file is attached, for Apple, Outlook and other calendars. Need to change the time? Reply to this email.</p></div>`
    + `<div style="background:#f6f8f9;padding:12px 22px;font-size:12px;color:#556470">Maha Hub Group of Companies Limited &middot; Bangkok, Thailand</div></div>`;
  const text = `Your ${title.toLowerCase()} is confirmed.\n\n${title}\n${w.text}\n${len} minutes\n\nAdd to Google Calendar: ${gcal}\n\nNeed to change the time? Reply to this email.\n\nMaha Hub`;
  let ok = false;
  for (const email of to) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: FROM, to: [{ email }], replyTo: { email: FROM.email }, subject: `Confirmed: ${title} on ${when(date, time, len).text.split(",").slice(0, 2).join(",")}`, htmlContent: html, textContent: text, attachment: [{ name: "maha-hub-booking.ics", content: btoa(ics) }], tags: ["crm-booking"] }),
    }).catch(() => null);
    if (res && res.ok) ok = true;
  }
  return ok;
};

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const SB = Deno.env.get("SUPABASE_URL"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB || !SERVICE) return json(req, { error: "not_configured" }, 503);
  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(req.url);

  let body: Record<string, unknown> = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); } }
  else if (req.method !== "GET") return json(req, { error: "method_not_allowed" }, 405);
  const q = (k: string) => req.method === "GET" ? url.searchParams.get(k) || "" : String(body[k] ?? "");

  /* which booking: a page type, or a signed Enewletter link */
  const token = q("t"), pay = token ? await open(token) : null;
  if (token && !pay) return json(req, { error: "link_not_valid" }, 400);
  const key = pay ? (pay.k === "bookm" ? "meeting" : "talk") : q("type");
  const cfg = TYPES[key];
  if (!cfg) return json(req, { error: "unknown_type" }, 404);
  const rid = pay ? "rp_" + (await sha(token)).slice(0, 24) : "";
  const had = rid ? (await admin.from("maha_sales_records").select("id").eq("id", rid).maybeSingle()).data : null;

  if (req.method === "GET") {
    if (q("av") === "1") {
      if (had) return json(req, { ok: true, days: {}, done: true });
      const from = DATE.test(q("from")) ? q("from") : todayBkk();
      const days = await freeSlots(admin, from, Math.min(Math.max(Number(q("days")) || 28, 1), 42), cfg.what, { len: cfg.len, step: cfg.step });
      return json(req, { ok: true, days, today: todayBkk(), ahead: AHEAD, len: cfg.len });
    }
    return json(req, { ok: true, type: { key, title: cfg.title, len: cfg.len, phone: cfg.phone }, prefill: { email: pay ? str(pay.e, 254) : "", hotel: pay ? str(pay.n, 120) : "" }, done: !!had });
  }

  /* ---- book ---- */
  if (had) return json(req, { ok: true, done: true });
  const slotRaw = body.slot as { date?: unknown; time?: unknown } | undefined;
  const date = str(slotRaw?.date, 10), time = str(slotRaw?.time, 5);
  const first = str(body.first, 60), last = str(body.last, 60), email = str(body.email, 254).toLowerCase(), hotel = str(body.hotel, 120), phone = str(body.phone, 30), note = str(body.note, 500);
  const guests = (Array.isArray(body.guests) ? body.guests : []).map((x) => str(x, 254).toLowerCase()).filter((x) => EMAIL.test(x) && x !== email).slice(0, 3);
  if (!DATE.test(date) || !TIME.test(time) || !first || !last || !EMAIL.test(email) || !hotel || (cfg.phone && !phone)) return json(req, { error: "check_the_form" }, 400);
  if (str(body.website, 50)) return json(req, { ok: true, title: cfg.title, date, time, len: cfg.len, mailed: false });   // a robot filled the hidden box: look done, record nothing
  const name = first + " " + last;

  if (pay && pay.h === "test") return json(req, { ok: true, title: cfg.title, date, time, len: cfg.len, mailed: false });   // a link of a test mail: nothing is recorded

  if (!(await isFree(admin, date, time, cfg.what, { len: cfg.len, step: cfg.step }))) return json(req, { error: "slot_taken" }, 409);

  /* a customer may not hold more than two coming bookings */
  const { data: mine } = await admin.from("maha_sales_records").select("id").eq("kind", "act").eq("deleted", false).filter("data->>contactEmail", "ilike", email.replace(/[%_\\]/g, "\\$&")).gte("data->>date", todayBkk()).filter("data->>source", "eq", "Booking page");
  if ((mine || []).length >= 2) return json(req, { error: "too_many" }, 429);

  /* the hotel record: from the Enewletter link, else the one with this email or this name, else a new one (New Database) */
  const now = new Date().toISOString();
  let hotelId = pay ? str(pay.h, 80) : "", hotelName = hotel;
  const rows: { id: string; kind: string; deleted: boolean; data: Record<string, unknown> }[] = [];
  if (!hotelId) {
    const { data: byMail } = await admin.from("maha_sales_records").select("id,data").eq("kind", "hotel").eq("deleted", false).filter("data->>email", "ilike", email.replace(/[%_\\]/g, "\\$&")).limit(1);
    const { data: byName } = byMail && byMail[0] ? { data: null } : await admin.from("maha_sales_records").select("id,data").eq("kind", "hotel").eq("deleted", false).filter("data->>name", "ilike", hotel.replace(/[%_\\]/g, "\\$&")).limit(1);
    const hit = (byMail && byMail[0]) || (byName && byName[0]);
    if (hit) { hotelId = hit.id; hotelName = str((hit.data as Record<string, unknown>).name, 120) || hotel; }
    else {
      hotelId = "h_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      rows.push({ id: hotelId, kind: "hotel", deleted: false, data: {
        id: hotelId, kind: "hotel", name: hotel, status: "New Database", managed: "No", source: "Website booking", contact: name, email, contactPhone: phone,
        contacts: [{ name, position: "", email, phone }], created: now, updated: now,
      } });
    }
  }
  const mid = "bk_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const summary = str(cfg.title + " booked on the booking page" + (note ? ". " + note : "") + (guests.length ? ". Guests: " + guests.join(", ") : ""), 500);
  if (cfg.what === "meeting") {
    rows.push({ id: mid, kind: "act", deleted: false, data: {
      id: mid, kind: "act", hotelId, type: "Meeting", date, time, summary, contactName: name, contactEmail: email, contactPhone: phone, meeting: true, meetType: "Online",
      meetStatus: "On Process", owner: pay ? str(pay.w, 80) : "", done: true, source: pay ? "Enewletter reply" : "Booking page", created: now, updated: now,
    } });
  } else {
    rows.push({ id: mid, kind: "act", deleted: false, data: {
      id: mid, kind: "act", hotelId, type: "Call", date: todayBkk(), nextDate: date, nextTime: time, summary: summary + ". Call at " + time + " (" + cfg.len + " minutes)",
      contactName: name, contactEmail: email, contactPhone: phone, owner: pay ? str(pay.w, 80) : "", done: false, source: pay ? "Enewletter reply" : "Booking page", created: now, updated: now,
    } });
  }
  if (pay) rows.push({ id: rid, kind: "reply", deleted: false, data: {
    id: rid, kind: "reply", hotelId, hotelName: str(pay.n, 120) || hotelName, email, tpl: str(pay.t, 60), subject: str(pay.s, 200), choice: "book", label: "Chose " + date + " " + time, note, at: now, updated: now, source: "click", owner: str(pay.w, 80),
  } });
  const { error } = await admin.from("maha_sales_records").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) return json(req, { error: "save_failed" }, 500);

  /* Busy in the Google Calendar, and the confirmation email (a demo or a meeting) */
  const s = startOf(date, time);
  try { await upsertEvent(mid, { title: cfg.title + ": " + hotelName + " (" + name + ")", description: [email, phone, note].filter(Boolean).join("\n"), startMs: s, endMs: s + cfg.len * 60000 }); } catch { /* the CRM record is saved */ }
  let mailed = false;
  if (cfg.mail) { try { mailed = await sendConfirmation([email, ...guests], first, cfg.title, date, time, cfg.len, mid); } catch { mailed = false; } }
  return json(req, { ok: true, title: cfg.title, date, time, len: cfg.len, mailed });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); }
});
