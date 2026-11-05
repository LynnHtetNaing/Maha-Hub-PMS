// The emails Supabase Auth sends (the sign-in code, the set-password / user-creation link), one look for each system.
// Pure functions (no network): index.ts sends what these return; tests/sync/authmail-test.js checks them.
// The system is read from the address the person came from (redirect_to / site_url): pms. = hotel side, console. = provider side, crm. / sales. = company CRM.

export const SYSTEMS = {
  pms: { name: "Maha PMS", tag: "Hotel system", header: "#113732", accent: "#3fcf9f", soft: "#eef8f4", line: "#b7dccd", text: "#1d6e55", logo: "https://maha-hub.com/brand/maha/pms-icon-96.png", page: "Maha PMS sign-in page" },
  console: { name: "Maha Provider", tag: "Provider console", header: "#1f2a37", accent: "#d49a38", soft: "#fbf5e9", line: "#ead9b0", text: "#8a6217", logo: "https://maha-hub.com/brand/maha/pms-icon-96.png", page: "Maha Provider sign-in page" },
  crm: { name: "Maha CRM", tag: "Company sales", header: "#0A3020", accent: "#d49a38", soft: "#fbf5e9", line: "#ead9b0", text: "#8a6217", logo: "https://maha-hub.com/brand/maha-mark.png", page: "Maha CRM sign-in page" },
  default: { name: "Maha Hub", tag: "Maha Hub Group of Companies Limited", header: "#113732", accent: "#3fcf9f", soft: "#eef8f4", line: "#b7dccd", text: "#1d6e55", logo: "https://maha-hub.com/brand/maha/pms-icon-96.png", page: "Maha Hub sign-in page" },
};

const HOSTS = { "pms.maha-hub.com": "pms", "console.maha-hub.com": "console", "crm.maha-hub.com": "crm", "sales.maha-hub.com": "crm" };
export const systemOf = (...urls) => {
  for (const u of urls) { try { const h = new URL(String(u || "")).hostname.toLowerCase(); if (HOSTS[h]) return HOSTS[h]; } catch { /* not an address */ } }
  return "default";
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const F = "font-family:Segoe UI,Helvetica,Arial,sans-serif";

const shell = (S, preheader, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(S.name)}</title></head>
<body style="margin:0;padding:0;background:#eef1ee">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1ee;font-size:1px;line-height:1px">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1ee"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dfe5e0;border-radius:14px;overflow:hidden">
<tr><td style="background:${S.header};padding:22px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="56" valign="middle"><img src="${S.logo}" width="52" height="52" alt="${esc(S.name)}" style="display:block;border:0;border-radius:12px"></td>
<td valign="middle" style="padding-left:14px;${F}"><div style="font-size:19px;line-height:24px;font-weight:700;color:#ffffff">${esc(S.name)}</div><div style="font-size:12px;line-height:18px;color:${S.accent}">${esc(S.tag)}</div></td></tr></table></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${S.accent}">&nbsp;</td></tr>
${body}
<tr><td style="background:#f6f8f6;border-top:1px solid #e3e9e4;padding:20px 32px;${F};font-size:12px;line-height:19px;color:#7a8780;text-align:center"><div style="font-weight:700;color:#41514a">&copy; 2026 Maha Hub Group of Companies Limited.<br>All rights reserved.</div><div style="margin-top:6px">Bangkok, Thailand (Head Office)</div></td></tr>
</table></td></tr></table></body></html>`;

const warn = `<tr><td style="padding:22px 32px 30px;${F}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#f6f8f6;border-left:4px solid #113732;border-radius:6px;padding:14px 16px;font-size:13px;line-height:20px;color:#41514a"><b style="color:#1c2a24">Did not ask for this?</b><br>Do not share this email or its code or link with anyone. If it was not you, you can ignore it, or tell your manager or Maha Hub support.</td></tr></table></td></tr>`;

const codeEmail = (S, code) => ({
  subject: `Your ${S.name} sign-in code`,
  html: shell(S, `Your ${S.name} sign-in code is ${code}. It is valid for 10 minutes.`, `
<tr><td style="padding:34px 32px 6px;${F};color:#1c2a24"><div style="font-size:22px;line-height:30px;font-weight:700;margin:0 0 10px">Verify it&rsquo;s you</div>
<div style="font-size:15px;line-height:24px;color:#41514a">We received a sign-in to your ${esc(S.name)} account from a new device, or it is time for your regular security check. Enter this code on the ${esc(S.page)}.</div></td></tr>
<tr><td align="center" style="padding:22px 32px 8px;${F}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:360px"><tr><td align="center" style="background:${S.soft};border:1px solid ${S.line};border-radius:12px;padding:18px 12px">
<div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;color:${S.text};text-transform:uppercase;margin:0 0 8px">Your sign-in code</div>
<div style="font-family:Consolas,Menlo,Courier New,monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${S.header};padding-left:10px">${esc(code)}</div></td></tr></table>
<div style="font-size:13px;line-height:20px;color:#66756e;margin-top:12px">This code is valid for <b style="color:#1c2a24">10 minutes</b> and can be used only once.</div></td></tr>
<tr><td style="padding:20px 32px 6px;${F};color:#41514a;font-size:14px;line-height:22px">1. Go back to the ${esc(S.page)}.<br>2. Type the 6-digit code above.<br>3. Tick <i>&ldquo;Register this device&rdquo;</i> only on your own computer.</td></tr>${warn}`),
  text: `Your ${S.name} sign-in code: ${code}\n\nEnter it on the ${S.page}. It is valid for 10 minutes and works once. If you did not try to sign in, ignore this email and do not share the code.\n\nMaha Hub Group of Companies Limited, Bangkok, Thailand (Head Office)`,
});

const linkEmail = (S, link, kind, username) => {
  const isNew = kind === "invite" || kind === "signup";
  const title = isNew ? `Welcome to ${S.name}` : "Set your password";
  const intro = isNew ? `An account was created for you on ${S.name}. Press the button to choose your password and start.` : `Press the button to choose a new password for your ${S.name} account.`;
  return {
    subject: isNew ? `Your ${S.name} account is ready: set your password` : `Set your ${S.name} password`,
    html: shell(S, `${title}. The link works once.`, `
<tr><td style="padding:34px 32px 6px;${F};color:#1c2a24"><div style="font-size:22px;line-height:30px;font-weight:700;margin:0 0 10px">${esc(title)}</div><div style="font-size:15px;line-height:24px;color:#41514a">${esc(intro)}</div>
${username ? `<div style="margin-top:14px;font-size:14px;color:#41514a">Your username: <b style="color:#1c2a24">${esc(username)}</b></div>` : ""}</td></tr>
<tr><td align="center" style="padding:24px 32px 8px"><a href="${esc(link)}" style="display:inline-block;background:${S.header};color:#ffffff;${F};font-size:16px;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:10px">Set my password</a>
<div style="${F};font-size:13px;line-height:20px;color:#66756e;margin-top:14px">The link works <b style="color:#1c2a24">once</b> and for a short time.</div></td></tr>
<tr><td style="padding:14px 32px 6px;${F};font-size:12px;line-height:18px;color:#7a8780;word-break:break-all">If the button does not open, copy this address into your browser:<br>${esc(link)}</td></tr>${warn}`),
    text: `${title}\n\n${intro}\n${username ? `Username: ${username}\n` : ""}\nOpen this link: ${link}\n\nThe link works once and for a short time. If you did not ask for it, ignore this email.\n\nMaha Hub Group of Companies Limited, Bangkok, Thailand (Head Office)`,
  };
};

// payload = what the Supabase "Send Email" hook sends; supabaseUrl = https://<ref>.supabase.co
export function build(payload, supabaseUrl) {
  const u = payload.user || {}, d = payload.email_data || {}, kind = d.email_action_type || "";
  const key = systemOf(d.redirect_to, d.site_url), S = SYSTEMS[key];
  const link = `${String(supabaseUrl).replace(/\/+$/, "")}/auth/v1/verify?token=${encodeURIComponent(d.token_hash || "")}&type=${encodeURIComponent(kind)}&redirect_to=${encodeURIComponent(d.redirect_to || d.site_url || "")}`;
  const name = (u.user_metadata && u.user_metadata.maha_username) || "";
  if (kind === "magiclink" || kind === "email" || kind === "otp") return { system: key, to: u.email, ...codeEmail(S, d.token || "") };
  if (kind === "recovery" || kind === "invite" || kind === "signup") return { system: key, to: u.email, ...linkEmail(S, link, kind, name) };
  // anything else (email change, re-authentication): the same look, with the code when there is one
  if (d.token) return { system: key, to: u.email, ...codeEmail(S, d.token) };
  return { system: key, to: u.email, ...linkEmail(S, link, "recovery", name) };
}
