// Supabase Edge Function: maha-be-cron
// Runs every 15 minutes (pg_cron + pg_net, see the migration). Two jobs no guest-driven request can
// do on its own:
//   1. Reconcile a payment: a request left "awaiting" for 10+ minutes gets asked directly whether
//      Stripe really has it as paid - covers a guest who paid but never came back to the success
//      page (closed the tab, lost connection, etc.). Never trusts anything the browser remembers.
//   2. Send the lifecycle emails the Email Alerts settings describe but nothing has ever fired:
//      arrival (days before), departure (days after - thank-you/review), abandonment (days after
//      an unpaid/unconfirmed request was made). Each (property, reservation or request, alert type)
//      is sent at most once, tracked in maha_be_alert_sent.
// No authentication at all - this is a server-to-server tick, triggered only by this project's own
// pg_cron job, never reachable usefully by anyone else (it does nothing with any input it is given).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, BREVO_API_KEY.
// Deploy with JWT verification off (--no-verify-jwt).
// Never log a guest's email, name, or a secret key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); };

async function sendMail(admin: any, BREVO: string, propertyId: string, hotelName: string, to: string, subject: string, bodyHtml: string, doc: string) {
  if (!to) return false;
  const FROM = { name: Deno.env.get("PMS_MAIL_FROM_NAME") || "Maha Hub", email: Deno.env.get("PMS_MAIL_FROM") || "noreply@maha-hub.com" };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: bodyHtml, tags: ["booking-engine-" + doc] }),
  });
  await admin.from("maha_pms_mail_log").insert({ property_id: propertyId, sent_by: null, sent_by_name: "Booking Engine", to_email: to, subject, doc: "be-" + doc, rsvn: "", status: res.ok ? "sent" : "failed", error: res.ok ? "" : String(res.status) });
  return res.ok;
}
const simpleMail = (hotelName: string, greet: string, body: string) =>
  `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2d36">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0"><tr><td align="center" style="padding:20px 10px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#0A3020;padding:16px 28px"><span style="color:#fff;font-weight:bold;font-size:18px;letter-spacing:2px">MAHA HUB</span></td></tr>
  <tr><td style="padding:26px 28px"><p style="margin:0 0 12px">${esc(greet)}</p><p style="margin:0">${body}</p>
  <p style="margin:22px 0 0">${esc(hotelName)}</p></td></tr>
  <tr><td style="background:#faf5ec;padding:14px 28px;color:#7a7468;font-size:12px">This is an automatic message from Maha Hub on behalf of ${esc(hotelName)}. Please do not reply to it.</td></tr>
  </table></td></tr></table></body></html>`;

const handle = async (_req: Request): Promise<Response> => {
  const SB = Deno.env.get("SUPABASE_URL"), SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const BREVO = (Deno.env.get("BREVO_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!SB || !SERVICE) return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });
  const admin = createClient(SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  let reconciled = 0, mailed = 0;

  // 1. Payment reconciliation - any request stuck "awaiting" for 10+ minutes.
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuck } = await admin.from("maha_booking_requests")
    .select("id,property_id,stripe_session_id").eq("status", "pending").eq("payment_status", "awaiting")
    .not("stripe_session_id", "is", null).lt("created_at", cutoff).limit(200);
  for (const row of stuck || []) {
    try {
      const { data: prop } = await admin.from("maha_properties").select("property_code").eq("id", row.property_id).maybeSingle();
      const { data: key } = await admin.from("maha_stripe_keys").select("secret_key").eq("purpose", "guest").eq("property_id", row.property_id).maybeSingle();
      const secret = (key && key.secret_key || "").trim();
      if (!prop || !secret) continue;
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(row.stripe_session_id), { headers: { Authorization: "Bearer " + secret } });
      const data = await res.json().catch(() => ({}));
      const paid = res.ok && (data.payment_status === "paid" || data.status === "complete");
      if (paid) {
        const { error } = await admin.rpc("maha_be_mark_paid", { p_request: row.id, p_session_id: row.stripe_session_id });
        if (!error) {
          reconciled++;
          await fetch(`${SB}/functions/v1/maha-be-mail`, {
            method: "POST", headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", "Content-Type": "application/json" },
            body: JSON.stringify({ property_code: prop.property_code, request_id: row.id, kind: "confirmation" }),
          }).catch(() => {});
        }
      }
    } catch { /* try again next tick */ }
  }

  // 2. Lifecycle emails - only properties with at least one alert enabled.
  const { data: alertRows } = await admin.from("maha_records").select("property_id,data").eq("collection", "$set").eq("rec_key", "google").eq("deleted", false).limit(2000);
  for (const row of alertRows || []) {
    const ea = row.data && row.data.v && row.data.v.emailAlerts;
    if (!ea || typeof ea !== "object") continue;
    const anyOn = ["arrival", "departure", "abandonment"].some((k) => ea[k] && ea[k].enabled);
    if (!anyOn) continue;
    const propertyId = row.property_id;
    const { data: prop } = await admin.from("maha_properties").select("property_code,name,pms_enabled").eq("id", propertyId).maybeSingle();
    if (!prop) continue;
    const { data: bdRow } = await admin.from("maha_records").select("data").eq("property_id", propertyId).eq("collection", "$set").eq("rec_key", "bd").maybeSingle();
    const today = isoDate(new Date());
    const businessDate = (bdRow && bdRow.data && bdRow.data.v) || today;
    const hotelName = prop.name || prop.property_code;

    if (prop.pms_enabled === false) {
      // Booking-only properties do not materialise PMS reservations. Their confirmed Booking Engine
      // requests remain the authoritative inventory and lifecycle ledger.
      const { data: beRows } = await admin.from("maha_booking_requests")
        .select("id,standalone_ref,arr,dep,guest_name,guest_email")
        .eq("property_id", propertyId).eq("status", "confirmed")
        .not("standalone_ref", "is", null).limit(2000);
      for (const r of beRows || []) {
        if (ea.arrival && ea.arrival.enabled && r.arr === addDays(businessDate, Number(ea.arrival.leadDays) || 0) && r.guest_email) {
          const { error: dupe } = await admin.from("maha_be_alert_sent").insert({ property_id: propertyId, reservation_no: r.standalone_ref, booking_id: r.id, alert_type: "arrival" });
          if (!dupe) {
            const body = `We look forward to welcoming you to <b>${esc(hotelName)}</b> on ${esc(r.arr)}.${ea.arrival.body ? "<br><br>" + esc(ea.arrival.body).replace(/\n/g, "<br>") : ""}`;
            if (await sendMail(admin, BREVO, propertyId, hotelName, r.guest_email, `Looking forward to your stay at ${hotelName}`, simpleMail(hotelName, `Dear ${esc(r.guest_name || "Guest")},`, body), "arrival")) mailed++;
          }
        }
        if (ea.departure && ea.departure.enabled && r.dep === addDays(businessDate, -(Number(ea.departure.leadDays) || 0)) && r.guest_email) {
          const { error: dupe } = await admin.from("maha_be_alert_sent").insert({ property_id: propertyId, reservation_no: r.standalone_ref, booking_id: r.id, alert_type: "departure" });
          if (!dupe) {
            const body = `Thank you for staying with <b>${esc(hotelName)}</b>. We hope you enjoyed your visit - we would love to hear your feedback.${ea.departure.body ? "<br><br>" + esc(ea.departure.body).replace(/\n/g, "<br>") : ""}`;
            if (await sendMail(admin, BREVO, propertyId, hotelName, r.guest_email, `Thank you for staying with ${hotelName}`, simpleMail(hotelName, `Dear ${esc(r.guest_name || "Guest")},`, body), "departure")) mailed++;
          }
        }
      }
    } else {
    if (ea.arrival && ea.arrival.enabled) {
      const target = addDays(businessDate, Number(ea.arrival.leadDays) || 0);
      const { data: resRows } = await admin.from("maha_records").select("rec_key,data").eq("property_id", propertyId).eq("collection", "reservations").eq("deleted", false).limit(2000);
      for (const r of resRows || []) {
        const nr = r.data || {};
        for (const b of nr.bookings || []) {
          if (b.arr !== target || !["confirmed", "inhouse"].includes(b.status) || !nr.email) continue;
          const { error: dupe } = await admin.from("maha_be_alert_sent").insert({ property_id: propertyId, reservation_no: String(nr.no || r.rec_key), booking_id: b.id, alert_type: "arrival" });
          if (dupe) continue;
          const body = `We look forward to welcoming you to <b>${esc(hotelName)}</b> on ${esc(b.arr)}.${ea.arrival.body ? "<br><br>" + esc(ea.arrival.body).replace(/\n/g, "<br>") : ""}`;
          if (await sendMail(admin, BREVO, propertyId, hotelName, nr.email, `Looking forward to your stay at ${hotelName}`, simpleMail(hotelName, `Dear ${esc(nr.contact || "Guest")},`, body), "arrival")) mailed++;
        }
      }
    }
    if (ea.departure && ea.departure.enabled) {
      const target = addDays(businessDate, -(Number(ea.departure.leadDays) || 0));
      const { data: resRows } = await admin.from("maha_records").select("rec_key,data").eq("property_id", propertyId).eq("collection", "reservations").eq("deleted", false).limit(2000);
      for (const r of resRows || []) {
        const nr = r.data || {};
        for (const b of nr.bookings || []) {
          if (b.dep !== target || !["checkedout", "departed"].includes(b.status) || !nr.email) continue;
          const { error: dupe } = await admin.from("maha_be_alert_sent").insert({ property_id: propertyId, reservation_no: String(nr.no || r.rec_key), booking_id: b.id, alert_type: "departure" });
          if (dupe) continue;
          const body = `Thank you for staying with <b>${esc(hotelName)}</b>. We hope you enjoyed your visit - we would love to hear your feedback.${ea.departure.body ? "<br><br>" + esc(ea.departure.body).replace(/\n/g, "<br>") : ""}`;
          if (await sendMail(admin, BREVO, propertyId, hotelName, nr.email, `Thank you for staying with ${hotelName}`, simpleMail(hotelName, `Dear ${esc(nr.contact || "Guest")},`, body), "departure")) mailed++;
        }
      }
    }
    }
    if (ea.abandonment && ea.abandonment.enabled) {
      const abCutoff = new Date(Date.now() - (Number(ea.abandonment.leadDays) || 1) * 86400000).toISOString();
      const { data: abRows } = await admin.from("maha_booking_requests").select("id,guest_name,guest_email,created_at")
        .eq("property_id", propertyId).eq("status", "pending").neq("payment_status", "paid").lt("created_at", abCutoff).limit(200);
      for (const r of abRows || []) {
        if (!r.guest_email) continue;
        const { error: dupe } = await admin.from("maha_be_alert_sent").insert({ property_id: propertyId, reservation_no: r.id, booking_id: "request", alert_type: "abandonment" });
        if (dupe) continue;
        const body = `We noticed you started a booking with <b>${esc(hotelName)}</b> but did not finish it. We have held your details - come back any time to complete your reservation.${ea.abandonment.body ? "<br><br>" + esc(ea.abandonment.body).replace(/\n/g, "<br>") : ""}`;
        if (await sendMail(admin, BREVO, propertyId, hotelName, r.guest_email, `Complete your booking with ${hotelName}`, simpleMail(hotelName, `Dear ${esc(r.guest_name || "Guest")},`, body), "abandonment")) mailed++;
      }
    }
  }

  return new Response(JSON.stringify({ reconciled, mailed }), { status: 200, headers: { "Content-Type": "application/json" } });
};

Deno.serve(async (req) => {
  try { return await handle(req); } catch (e) { return new Response(JSON.stringify({ error: "server_error" }), { status: 500 }); }
});
