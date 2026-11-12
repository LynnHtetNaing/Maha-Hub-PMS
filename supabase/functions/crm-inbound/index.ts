// Supabase Edge Function: crm-inbound
// A hotel writes back to an Enewletter (the mail goes to crm@maha-hub.com): the Cloudflare Email Worker `workers/crm-inbound` passes the raw mail here,
// and the CRM lists it under Enewletter > Replies (what the hotel wrote, from whom, which hotel).
//   POST  body = the raw email (message/rfc822), header  x-inbound-secret: <INBOUND_SECRET>
// What it does: reads the mail, skips automatic replies / bounces / our own mail, cuts the quoted old text, finds the hotel by the sender address
// (the hotel email or a contact email of its follow ups and meetings), and keeps one "reply" record (kind reply, source email) in maha_sales_records.
// A second delivery of the same mail changes nothing. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INBOUND_SECRET. Deploy with --no-verify-jwt.
// Never log addresses, subjects or text.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PostalMime from "https://esm.sh/postal-mime@2.4.3";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

/* the new text only: the quoted old mail and the signature line of a mail program are cut */
export const trimReply = (text: string): string => {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n"), out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{5,120}wrote:\s*$/i.test(l) || /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^\s*From:\s.+/i.test(l) && out.length > 0 && /^\s*$/.test(out[out.length - 1])) break;
    if (/^\s*_{5,}\s*$/.test(l) || /^\s*Sent from my /i.test(l)) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const isAutomatic = (from: string, subject: string, headers: { key: string; value: string }[]): boolean => {
  const h = (k: string) => (headers.find((x) => x.key.toLowerCase() === k)?.value || "").toLowerCase();
  const auto = h("auto-submitted");
  if ((auto && auto !== "no") || h("x-autoreply") || h("x-autorespond") || /bulk|junk|auto_reply|list/.test(h("precedence"))) return true;
  if (/^(mailer-daemon|postmaster|no-?reply|noreply|crm@maha-hub\.com)/i.test(from)) return true;
  return /^(automatic reply|auto(matic)?[: ]|out of office|undeliverable|delivery status|returned mail)/i.test(subject.trim());
};

const handle = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const SB = Deno.env.get("SUPABASE_URL"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), SECRET = Deno.env.get("INBOUND_SECRET") || "";
  if (!SB || !SERVICE || SECRET.length < 16) return json({ error: "not_configured" }, 503);
  if (!same(req.headers.get("x-inbound-secret") || "", SECRET)) return json({ error: "forbidden" }, 403);

  const raw = new Uint8Array(await req.arrayBuffer());
  if (!raw.length || raw.length > 4_000_000) return json({ error: "bad_request" }, 400);
  const mail = await PostalMime.parse(raw);
  const from = String(mail.from?.address || "").trim().toLowerCase(), subject = String(mail.subject || "").slice(0, 200);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) return json({ ok: true, skipped: "no_sender" });
  if (isAutomatic(from, subject, (mail.headers || []) as { key: string; value: string }[])) return json({ ok: true, skipped: "automatic" });

  let text = trimReply(String(mail.text || "") || String(mail.html || "").replace(/<(br|\/p|\/div)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  text = text.slice(0, 3000);
  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  /* which hotel: its own email, else a contact email of one of its follow ups or meetings */
  let hotelId = "", hotelName = "";
  const q = from.replace(/[%_\\]/g, "\\$&");
  const { data: hs } = await admin.from("maha_sales_records").select("id,data").eq("kind", "hotel").eq("deleted", false).filter("data->>email", "ilike", q).limit(1);
  if (hs && hs[0]) { hotelId = hs[0].id; hotelName = String((hs[0].data as Record<string, unknown>).name || ""); }
  else {
    const { data: as } = await admin.from("maha_sales_records").select("data").eq("kind", "act").eq("deleted", false).filter("data->>contactEmail", "ilike", q).order("updated_at", { ascending: false }).limit(1);
    const hid = as && as[0] ? String((as[0].data as Record<string, unknown>).hotelId || "") : "";
    if (hid) {
      const { data: h2 } = await admin.from("maha_sales_records").select("id,data").eq("id", hid).maybeSingle();
      if (h2) { hotelId = h2.id; hotelName = String((h2.data as Record<string, unknown>).name || ""); }
    }
  }

  const now = new Date().toISOString(), id = "re_" + (await sha(String(mail.messageId || from + subject + text.slice(0, 200)))).slice(0, 24);
  const { error } = await admin.from("maha_sales_records").upsert([{ id, kind: "reply", deleted: false, data: {
    id, kind: "reply", source: "email", hotelId, hotelName, email: from, tpl: "", subject, choice: "email", label: "Wrote back", note: text || "(no text)", at: now, updated: now, owner: "",
  } }], { onConflict: "id", ignoreDuplicates: true });
  if (error) return json({ error: "save_failed" }, 500);
  return json({ ok: true, hotel: !!hotelId });
};

Deno.serve(async (req) => { try { return await handle(req); } catch { return json({ error: "server_error" }, 500); } });
