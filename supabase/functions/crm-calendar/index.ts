// Supabase Edge Function: crm-calendar
// Keeps the Google Calendar of the CRM in step with the CRM Meetings, and tells the CRM when a time is not free.
//   POST { action, ... }  (the caller is a signed-in CRM member or the provider, checked here)
//     status                                       -> { configured, gap, meet }
//     check   { date, time, len?, gap?, ignoreId? } -> { configured, clashes: [{ title, start, end }] }   the Google events too close to that time
//     upsert  { id, title, description?, date, time, len? } -> { ok, configured }   the meeting becomes a Busy event (same id each time: a change moves it)
//     remove  { id }                               -> { ok }   the meeting was deleted, rejected or did not come: the time is free again
// A time is "too close" when it is closer than CAL_GAP_MIN (90) minutes to another event: at least 1 hour 30 minutes between meetings.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_SA_JSON, GOOGLE_CALENDAR_ID (see _shared/gcal.ts). Deploy with --no-verify-jwt.
// Never log titles, times or keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GAP_MIN, MEET_MIN, clashes, configured, eventIdOf, removeEvent, startOf, upsertEvent } from "../_shared/gcal.ts";

const ORIGINS = [...new Set(["https://crm.maha-hub.com", "https://console.maha-hub.com", ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean)])];
const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const SB = Deno.env.get("SUPABASE_URL"), ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SB || !ANON) return json(req, { error: "not_configured" }, 503);

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u || !u.user) return json(req, { error: "not_signed_in" }, 401);
  const [m, p] = await Promise.all([userClient.rpc("maha_is_crm_member"), userClient.rpc("maha_is_platform_admin")]);
  if (m.data !== true && p.data !== true) return json(req, { error: "not_allowed" }, 403);

  let b: Record<string, unknown>; try { b = await req.json(); } catch { return json(req, { error: "bad_request" }, 400); }
  const action = String(b.action || "");
  if (action === "status") return json(req, { configured: configured(), gap: GAP_MIN, meet: MEET_MIN });
  if (!configured()) return json(req, { configured: false, clashes: [], ok: false });

  try {
    if (action === "check") {
      const date = str(b.date, 10), time = str(b.time, 5);
      if (!DATE.test(date) || !TIME.test(time)) return json(req, { error: "bad_request" }, 400);
      const len = Math.min(Math.max(Number(b.len) || MEET_MIN, 15), 480), gap = b.gap === undefined ? GAP_MIN : Math.min(Math.max(Number(b.gap) || 0, 0), 600);
      const s = startOf(date, time);
      return json(req, { configured: true, clashes: await clashes(s, s + len * 60000, gap, str(b.ignoreId, 80) ? await eventIdOf(str(b.ignoreId, 80)) : "") });
    }
    if (action === "upsert") {
      const id = str(b.id, 80), date = str(b.date, 10), time = str(b.time, 5);
      if (!id || !DATE.test(date) || !TIME.test(time)) return json(req, { error: "bad_request" }, 400);
      const len = Math.min(Math.max(Number(b.len) || MEET_MIN, 15), 480), s = startOf(date, time);
      const ok = await upsertEvent(id, { title: str(b.title, 200) || "Maha meeting", description: str(b.description, 2000), startMs: s, endMs: s + len * 60000 });
      return json(req, { configured: true, ok });
    }
    if (action === "remove") {
      const id = str(b.id, 80); if (!id) return json(req, { error: "bad_request" }, 400);
      return json(req, { configured: true, ok: await removeEvent(id) });
    }
  } catch { return json(req, { error: "google_unavailable" }, 502); }
  return json(req, { error: "bad_request" }, 400);
};

Deno.serve(async (req) => { try { return await handle(req); } catch { return json(req, { error: "server_error" }, 500); } });
