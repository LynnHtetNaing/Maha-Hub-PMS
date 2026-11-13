// The guest's booking confirmation mail (sent by pms-send-mail, a no-reply mail from the Maha Hub brand).
// One pure function: the facts of the booking in, the finished mail (HTML for the screen, plain text for the rest) out.
// Everything is clipped and escaped here, so the browser can never put markup or a script into the mail.
// No dependencies, so the same code runs in the Edge function, in the tests and in the sample page.

export type Confirmation = {
  hotel: { name: string; address: string; phone: string; email: string };
  guest: { name: string };
  booking: { no: string; confirmation: string; arrLabel: string; depLabel: string; checkin: string; checkout: string; nights: string; roomType: string; ratePlan: string; pax: string };
  money: { cur: string; payStatus: string; rate: string; roomTotal: string; paid: string; balance: string };
  terms: string;   /* one term or condition on each line: the cancellation, child and no-show rules and every other term */
  request: string[];
};

const clip = (s: unknown, n: number) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
/* so the mail stays good-looking: only the first lines of each text are shown (the provider sees the same limits in the hotel setup) */
export const MAIL_LIMITS = { terms: 12, request: 6, line: 240 };
const lim = (s: unknown, n: number) => String(s == null ? "" : s).split(/\n+/).map((x) => clip(x, MAIL_LIMITS.line)).filter(Boolean).slice(0, n).join("\n");
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* a clean copy of whatever the browser sent */
export function cleanConfirmation(d: any): Confirmation {
  const o = d && typeof d === "object" ? d : {}, h = o.hotel || {}, g = o.guest || {}, b = o.booking || {}, m = o.money || {};
  return {
    hotel: { name: clip(h.name, 120), address: clip(h.address, 240), phone: clip(h.phone, 40), email: /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(h.email || "")) ? clip(h.email, 160) : "" },
    guest: { name: clip(g.name, 120) },
    booking: { no: clip(b.no, 40), confirmation: clip(b.confirmation, 40), arrLabel: clip(b.arrLabel, 60), depLabel: clip(b.depLabel, 60), checkin: clip(b.checkin, 12), checkout: clip(b.checkout, 12), nights: clip(b.nights, 40), roomType: clip(b.roomType, 120), ratePlan: clip(b.ratePlan, 120), pax: clip(b.pax, 80) },
    money: { cur: clip(m.cur, 8), payStatus: clip(m.payStatus, 40), rate: clip(m.rate, 30), roomTotal: clip(m.roomTotal, 30), paid: clip(m.paid, 30), balance: clip(m.balance, 30) },
    terms: lim(o.terms, MAIL_LIMITS.terms),
    request: (Array.isArray(o.request) ? o.request : []).map((x: unknown) => clip(x, MAIL_LIMITS.line)).filter(Boolean).slice(0, MAIL_LIMITS.request),
  };
}

const FOREST = "#0A3020", GOLD = "#D49A38", INK = "#1f2d36", MUTED = "#5b6a73", LINE = "#e3e8e6", BOX = "#f1f5f3";
const LOGO = "https://maha-hub.com/brand/maha/gate-gold.png";

export function confirmationSubject(c: Confirmation): string {
  return `Thanks! Your booking is confirmed at ${c.hotel.name || "your hotel"}`;
}

/* the lines under the price, by how the booking is paid */
function payRows(m: Confirmation["money"]): [string, string][] {
  const cur = m.cur ? m.cur + " " : "", amt = (v: string) => (v ? cur + v : "");
  switch (m.payStatus) {
    case "Paid": return [["Amount Paid", amt(m.paid || m.roomTotal)]];
    case "Partially paid": return [["Deposit Paid", amt(m.paid)], ["Remaining Amount to Pay", amt(m.balance)]];
    case "Pay at the hotel": return [["Pay to Hotel", amt(m.balance || m.roomTotal)]];
    case "OTA collect": return [["Payment", "Collected by the booking channel"]];
    default: return [];
  }
}

export function confirmationMail(c: Confirmation): { html: string; text: string } {
  const H = c.hotel, B = c.booking, M = c.money, cur = M.cur ? M.cur + " " : "";
  const name = c.guest.name;
  const maps = H.address ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(H.name + ", " + H.address) : "";
  const row = (k: string, v: string) => v ? `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${MUTED};width:42%;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${INK};font-weight:bold;vertical-align:top">${esc(v)}</td></tr>` : "";
  const btn = (href: string, label: string, primary: boolean) => `<td style="padding:0 10px 10px 0"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;text-decoration:none;background:${primary ? FOREST : "#dcebe4"};color:${primary ? "#ffffff" : FOREST}">${esc(label)}</a></td>`;
  const section = (title: string, inner: string) => `<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d3dcd8;border-radius:12px;border-collapse:separate;overflow:hidden"><tr><td style="background:${BOX};padding:12px 18px;border-bottom:1px solid #d3dcd8;font-size:16px;font-weight:bold;color:${FOREST}">${esc(title)}</td></tr><tr><td style="padding:4px 18px 12px">${inner}</td></tr></table></td></tr>`;
  const dashes = (t: string) => `<div style="padding-top:8px;color:${INK}">${(t ? t.split("\n") : [""]).map((x) => `<div style="padding:3px 0">- ${esc(x)}</div>`.replace("- </div>", "-</div>")).join("")}</div>`;
  const payTag = M.payStatus && M.payStatus !== "-" ? row("Payment status", M.payStatus) : "";
  const money = M.rate || M.roomTotal;
  const priceTable = money ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">${payTag}${row("Rate per night", M.rate ? cur + M.rate : "")}${row("Total Room Nights", B.nights)}${row("Total price", M.roomTotal ? cur + M.roomTotal : "")}${payRows(M).map((r) => row(r[0], r[1])).join("")}</table>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(confirmationSubject(c))}</title></head>
<body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${FOREST};padding:18px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px"><img src="${LOGO}" alt="" width="40" height="40" style="display:block;border:0"></td><td style="color:#ffffff;font-weight:bold;font-size:18px;letter-spacing:2px">MAHA HUB</td></tr></table></td></tr>
<tr><td style="padding:26px 28px 6px"><div style="font-size:24px;line-height:1.25;font-weight:bold;color:${FOREST}">Thanks${name ? ", " + esc(name) : ""}! Your booking is confirmed.</div>
<div style="margin-top:8px;color:${MUTED}">${esc(H.name || "Your hotel")} is expecting you${B.arrLabel ? " on " + esc(B.arrLabel) : ""}.</div></td></tr>
<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BOX};border-radius:14px"><tr><td style="padding:18px 20px">
<div style="font-size:18px;font-weight:bold;color:${INK}">${esc(H.name)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px"><tr>
<td width="50%" valign="top" style="padding-right:8px"><div style="color:${MUTED};font-size:13px">Check-in${B.checkin ? " from " + esc(B.checkin) : ""}</div><div style="font-size:17px;font-weight:bold">${esc(B.arrLabel)}</div></td>
<td width="50%" valign="top"><div style="color:${MUTED};font-size:13px">Check-out${B.checkout ? " until " + esc(B.checkout) : ""}</div><div style="font-size:17px;font-weight:bold">${esc(B.depLabel)}</div>${B.nights ? `<div style="color:${MUTED};font-size:13px;margin-top:2px">${esc(B.nights)}</div>` : ""}</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px"><tr>
${H.address ? `<td valign="top" style="padding-right:8px"><div style="color:${MUTED};font-size:13px">Address</div><div style="font-weight:bold">${esc(H.address)}</div></td>` : ""}
${B.confirmation ? `<td valign="top"><div style="color:${MUTED};font-size:13px">Confirmation number</div><div style="font-weight:bold">${esc(B.confirmation)}</div></td>` : ""}</tr></table>
${H.phone || H.email ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px"><tr>${H.phone ? `<td valign="top" style="padding-right:8px"><div style="color:${MUTED};font-size:13px">Phone</div><div style="font-weight:bold">${esc(H.phone)}</div></td>` : ""}${H.email ? `<td valign="top"><div style="color:${MUTED};font-size:13px">Email</div><div style="font-weight:bold"><a href="mailto:${esc(H.email)}" style="color:${INK};text-decoration:none">${esc(H.email)}</a></div></td>` : ""}</tr></table>` : ""}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:16px"><tr>${maps ? btn(maps, "Directions", true) : ""}${H.email ? btn("mailto:" + H.email, "Email the hotel", false) : ""}</tr></table>
</td></tr></table></td></tr>
${section("Reservation details", `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">${row("Reservation", B.no)}${row("Guest name", name)}${row("Room Type", B.roomType)}${row("Rate plan", B.ratePlan)}${row("You booked for", B.pax)}${row("Check-in", (B.arrLabel + (B.checkin ? " (from " + B.checkin + ")" : "")).trim())}${row("Check-out", (B.depLabel + (B.checkout ? " (until " + B.checkout + ")" : "")).trim())}</table>`)}
${money ? section("Price and payment", priceTable) : ""}
${c.request.length ? section("Your Request", `<ul style="margin:10px 0 0;padding-left:20px;color:${INK}">${c.request.map((n) => `<li style="margin:4px 0">${esc(n)}</li>`).join("")}</ul>`) : ""}
${section("Terms and Conditions", dashes(c.terms))}
<tr><td style="padding:26px 28px 24px"><div style="color:${MUTED};font-size:13px">Please keep this mail for your records. If you need to change or ask about your booking, contact ${esc(H.name || "the hotel")} directly${H.phone ? " on " + esc(H.phone) : ""}.</div></td></tr>
<tr><td style="background:#faf5ec;padding:14px 28px;color:#7a7468;font-size:12px">This is an automatic message from Maha Hub on behalf of ${esc(H.name || "the hotel")}. Please do not reply to it.</td></tr>
</table></td></tr></table></body></html>`;

  const lines: string[] = [];
  lines.push(`Thanks${name ? ", " + name : ""}! Your booking is confirmed.`, `${H.name || "Your hotel"} is expecting you${B.arrLabel ? " on " + B.arrLabel : ""}.`, "");
  const L = (k: string, v: string) => { if (v) lines.push(`${k}: ${v}`); };
  L("Hotel", H.name); L("Address", H.address); L("Phone", H.phone); L("Email", H.email); L("Confirmation number", B.confirmation); L("Reservation", B.no); L("Guest name", name);
  L("Check-in", (B.arrLabel + (B.checkin ? " (from " + B.checkin + ")" : "")).trim()); L("Check-out", (B.depLabel + (B.checkout ? " (until " + B.checkout + ")" : "")).trim());
  L("Room Type", B.roomType); L("Rate plan", B.ratePlan); L("You booked for", B.pax);
  if (money) { lines.push(""); L("Payment status", M.payStatus === "-" ? "" : M.payStatus); L("Rate per night", M.rate ? cur + M.rate : ""); L("Total Room Nights", B.nights); L("Total price", M.roomTotal ? cur + M.roomTotal : ""); payRows(M).forEach((r) => L(r[0], r[1])); }
  if (maps) lines.push("", "Directions: " + maps);
  if (c.request.length) lines.push("", "Your Request", ...c.request.map((n) => "- " + n));
  lines.push("", "Terms and Conditions", ...(c.terms ? c.terms.split("\n").map((x) => "- " + x) : ["-"]), "", "This is an automatic message from Maha Hub on behalf of " + (H.name || "the hotel") + ". Please do not reply to it.");
  return { html, text: lines.join("\n") };
}
