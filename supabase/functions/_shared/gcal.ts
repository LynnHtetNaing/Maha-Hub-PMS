// Shared Google Calendar helper for the CRM functions (crm-calendar, crm-reply).
// The CRM uses a Google SERVICE ACCOUNT: the CEO shares the calendar with the service account address ("Make changes to events"), so nobody signs in with Google
// and no personal password or token is stored. Everything stays in two Supabase secrets:
//   GOOGLE_SA_JSON      the service account key file (the whole JSON text)
//   GOOGLE_CALENDAR_ID  the calendar to use (for example the CEO's Gmail address, or the id of a calendar made for meetings)
// Optional: CAL_GAP_MIN (default 90: a meeting starts at least 1 hour 30 minutes after the START of the one before: a meeting at 9:00 means the next one at 10:30 or later), CAL_MEET_MIN (default 60: length of a meeting).
// Times are Bangkok time (+07:00). Never log keys, titles or addresses.

export const GAP_MIN = Number(Deno.env.get("CAL_GAP_MIN") || 90);
export const MEET_MIN = Number(Deno.env.get("CAL_MEET_MIN") || 60);
export const CALL_MIN = 30;

const b64u = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

type Key = { client_email: string; private_key: string };
const key = (): Key | null => {
  try {
    const k = JSON.parse(Deno.env.get("GOOGLE_SA_JSON") || "");
    return k && k.client_email && k.private_key ? k : null;
  } catch { return null; }
};
export const calId = () => (Deno.env.get("GOOGLE_CALENDAR_ID") || "").trim();
export const configured = () => !!key() && !!calId();

let cached: { token: string; exp: number } | null = null;
const token = async (): Promise<string> => {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const k = key(); if (!k) throw new Error("not_configured");
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: k.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3300 }));
  const pem = k.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const ck = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, new TextEncoder().encode(head + "." + claim)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64u(sig) }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error("google_auth");
  cached = { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3300) * 1000 };
  return cached.token;
};

const api = async (method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> => {
  const res = await fetch("https://www.googleapis.com/calendar/v3" + path, {
    method, headers: { authorization: "Bearer " + (await token()), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

/* a CRM record id becomes the Google event id (letters 0-9 a-f are allowed in an event id, at least 5 characters) */
export const eventIdOf = async (crmId: string): Promise<string> => {
  const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("maha-crm:" + crmId)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "crm" + h.slice(0, 40);
};

export const startOf = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const bkk = (ms: number) => new Date(ms + 7 * 3600000).toISOString().replace("T", " ").slice(0, 16);

export type Clash = { title: string; start: string; end: string };

/* events of the calendar that overlap [start, end] or START closer than gapMin minutes to the start (the 1 hour 30 minutes rule; gapMin 0 = overlap only); the event with ignoreId is the one being changed */
export const clashes = async (startMs: number, endMs: number, gapMin: number, ignoreId = ""): Promise<Clash[]> => {
  if (!configured()) return [];
  const q = new URLSearchParams({ timeMin: iso(startMs - gapMin * 60000), timeMax: iso(endMs + gapMin * 60000), singleEvents: "true", maxResults: "50", orderBy: "startTime" });
  const r = await api("GET", `/calendars/${encodeURIComponent(calId())}/events?${q}`);
  if (!r.ok) throw new Error("google_read");
  const out: Clash[] = [];
  for (const e of r.data.items || []) {
    if (e.status === "cancelled" || e.transparency === "transparent" || (ignoreId && e.id === ignoreId)) continue;
    const s = e.start?.dateTime ? Date.parse(e.start.dateTime) : e.start?.date ? Date.parse(e.start.date + "T00:00:00+07:00") : NaN;
    const en = e.end?.dateTime ? Date.parse(e.end.dateTime) : e.end?.date ? Date.parse(e.end.date + "T00:00:00+07:00") : NaN;
    if (isNaN(s) || isNaN(en)) continue;
    if ((s < endMs && en > startMs) || (gapMin > 0 && Math.abs(s - startMs) < gapMin * 60000)) out.push({ title: String(e.summary || "Busy").slice(0, 80), start: bkk(s), end: bkk(en) });
  }
  return out;
};

/* the busy events of the calendar between two moments (free / cancelled ones are left out): used to work out the free times a customer may choose */
export const listEvents = async (fromMs: number, toMs: number): Promise<{ s: number; e: number }[]> => {
  if (!configured()) return [];
  const q = new URLSearchParams({ timeMin: iso(fromMs), timeMax: iso(toMs), singleEvents: "true", maxResults: "250", orderBy: "startTime" });
  const r = await api("GET", `/calendars/${encodeURIComponent(calId())}/events?${q}`);
  if (!r.ok) throw new Error("google_read");
  const out: { s: number; e: number }[] = [];
  for (const ev of r.data.items || []) {
    if (ev.status === "cancelled" || ev.transparency === "transparent") continue;
    const s = ev.start?.dateTime ? Date.parse(ev.start.dateTime) : ev.start?.date ? Date.parse(ev.start.date + "T00:00:00+07:00") : NaN;
    const e = ev.end?.dateTime ? Date.parse(ev.end.dateTime) : ev.end?.date ? Date.parse(ev.end.date + "T00:00:00+07:00") : NaN;
    if (!isNaN(s) && !isNaN(e)) out.push({ s, e });
  }
  return out;
};

export const upsertEvent = async (crmId: string, o: { title: string; description?: string; startMs: number; endMs: number }): Promise<boolean> => {
  if (!configured()) return false;
  const id = await eventIdOf(crmId);
  const body = {
    id, summary: o.title.slice(0, 200), description: (o.description || "").slice(0, 2000), transparency: "opaque", status: "confirmed",
    start: { dateTime: iso(o.startMs), timeZone: "Asia/Bangkok" }, end: { dateTime: iso(o.endMs), timeZone: "Asia/Bangkok" },
    extendedProperties: { private: { maha_crm: "1" } },
  };
  const put = await api("PUT", `/calendars/${encodeURIComponent(calId())}/events/${id}`, body);
  if (put.ok) return true;
  if (put.status === 404) { const ins = await api("POST", `/calendars/${encodeURIComponent(calId())}/events`, body); return ins.ok; }
  return false;
};

export const removeEvent = async (crmId: string): Promise<boolean> => {
  if (!configured()) return false;
  const r = await api("DELETE", `/calendars/${encodeURIComponent(calId())}/events/${await eventIdOf(crmId)}`);
  return r.ok || r.status === 404 || r.status === 410;
};
