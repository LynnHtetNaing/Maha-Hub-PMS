// The free times a customer may choose, worked out live from the Google Calendar and the CRM Meetings (shared by crm-reply).
// A time is free when it is in the opening hours, far enough ahead, and clear of every other event:
//   - a MEETING must not overlap an event and must START at least GAP_MIN (90) minutes after the start of another one (9:00 taken: 10:30 or later);
//   - a CALL (30 minutes) only must not overlap an event.
// Opening hours (Bangkok time) can be changed with Supabase secrets, no code: CAL_HOURS ("09:00-17:00,21:00-24:00": two windows, a morning to evening one and a night one for
// customers in other time zones; any number of windows, comma separated), CAL_DAYS ("0,1,2,3,4,5,6" = every day, Monday to Sunday; 0 = Sunday, 1 = Monday),
// CAL_STEP (30 minutes between start times), CAL_AHEAD (60 days ahead, from today), CAL_NOTICE_H (2 hours notice: the first free time is 2 hours from now).
// Never log customers, titles or times.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GAP_MIN, MEET_MIN, CALL_MIN, listEvents, startOf } from "./gcal.ts";

const num = (k: string, d: number) => { const v = Number(Deno.env.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
/* the opening windows of a day, in minutes (a window may end at 24:00) */
const windows = (s: string) => s.split(",").map((x) => /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(x.trim())).filter((m) => !!m)
  .map((m) => ({ from: Number(m![1]) * 60 + Number(m![2]), to: Number(m![3]) * 60 + Number(m![4]) })).filter((w) => w.to > w.from && w.to <= 1440);
export const OPEN = (() => { const l = windows(Deno.env.get("CAL_HOURS") || "09:00-17:00,21:00-24:00"); return l.length ? l : [{ from: 540, to: 1020 }, { from: 1260, to: 1440 }]; })();
export const DAYS = new Set((Deno.env.get("CAL_DAYS") || "0,1,2,3,4,5,6").split(",").map((x) => Number(x.trim())).filter((x) => x >= 0 && x <= 6));
export const STEP = num("CAL_STEP", 30);
export const AHEAD = num("CAL_AHEAD", 60);
export const NOTICE_H = num("CAL_NOTICE_H", 2);

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const dayOf = (ms: number) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => dayOf(Date.parse(date + "T12:00:00+07:00") + n * 86400000);
const weekday = (date: string) => new Date(date + "T12:00:00+07:00").getUTCDay();

export type Busy = { s: number; e: number; meeting: boolean };

/* everything that is busy between two dates: the Google events and the CRM Meetings (a CRM meeting is also a Google event; counting twice does no harm) */
export const busyBetween = async (admin: ReturnType<typeof createClient>, fromDate: string, toDate: string): Promise<Busy[]> => {
  const out: Busy[] = [];
  try { for (const x of await listEvents(startOf(fromDate, "00:00") - 86400000, startOf(toDate, "23:59") + 86400000)) out.push({ ...x, meeting: true }); } catch { /* Google not reachable: the CRM meetings still count */ }
  const { data } = await admin.from("maha_sales_records").select("data").eq("kind", "act").eq("deleted", false)
    .gte("data->>date", addDays(fromDate, -1)).lte("data->>date", addDays(toDate, 1));
  for (const r of (data || []) as { data: Record<string, unknown> }[]) {
    const a = r.data || {};
    if (!(a.meeting === true || a.type === "Meeting") || !/^\d{2}:\d{2}$/.test(String(a.time || "")) || ["Reject", "No Show", "Cancelled"].includes(String(a.meetStatus || ""))) continue;
    const s = startOf(String(a.date), String(a.time));
    if (!isNaN(s)) out.push({ s, e: s + MEET_MIN * 60000, meeting: true });
  }
  return out;
};

const clear = (busy: Busy[], s: number, e: number, gapMin: number) =>
  !busy.some((b) => (s < b.e && b.s < e) || (gapMin > 0 && b.meeting && Math.abs(s - b.s) < gapMin * 60000));

/* the free start times of each day from fromDate for `days` days (only days that have at least one) */
export const freeSlots = async (admin: ReturnType<typeof createClient>, fromDate: string, days: number, what: "call" | "meeting", o: { len?: number; step?: number } = {}): Promise<Record<string, string[]>> => {
  const len = o.len || (what === "meeting" ? MEET_MIN : CALL_MIN), gap = what === "meeting" ? GAP_MIN : 0, step = o.step || STEP;
  const today = dayOf(Date.now()), last = addDays(today, AHEAD);
  let from = fromDate < today ? today : fromDate;
  if (from > last) return {};
  let to = addDays(from, Math.min(Math.max(days, 1), 90) - 1); if (to > last) to = last;
  const busy = await busyBetween(admin, from, to), earliest = Date.now() + NOTICE_H * 3600000, out: Record<string, string[]> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!DAYS.has(weekday(d))) continue;
    const list: string[] = [];
    for (const w of OPEN) {
      for (let m = w.from; m + len <= w.to; m += step) {
        const s = startOf(d, hhmm(m)), e = s + len * 60000;
        if (s >= earliest && clear(busy, s, e, gap)) list.push(hhmm(m));
      }
    }
    if (list.length) out[d] = list;
  }
  return out;
};

/* is this one time still free (checked again when the customer confirms, so two customers never get the same time) */
export const isFree = async (admin: ReturnType<typeof createClient>, date: string, time: string, what: "call" | "meeting", o: { len?: number; step?: number } = {}): Promise<boolean> => {
  const day = (await freeSlots(admin, date, 1, what, o))[date];
  return !!day && day.includes(time);
};
