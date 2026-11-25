// The emails Supabase Auth sends (the sign-in code, the set-password / user-creation link): the same box for every system, with the system name in it.
// Pure functions (no network): index.ts sends what these return; tests/sync/authmail-test.js checks them.
// The system is read from the address the person came from (redirect_to / site_url): pms. = hotel side, console. = provider side, crm. / sales. = company CRM.

// One look for every system (the same card, colours and logo as the Maha PMS email); only the name that mentions the system changes.
const LOOK = { tag: "Maha Hub Group of Companies Limited", logo: "https://maha-hub.com/brand/maha/pms-icon-96.png" };
export const SYSTEMS = {
  pms: { ...LOOK, name: "Maha PMS", page: "Maha PMS sign-in page" },
  console: { ...LOOK, name: "Maha Provider", page: "Maha Provider sign-in page" },
  crm: { ...LOOK, name: "Maha CRM", page: "Maha CRM sign-in page" },
  default: { ...LOOK, name: "Maha Hub", page: "Maha Hub sign-in page" },
};

const HOSTS = { "pms.maha-hub.com": "pms", "console.maha-hub.com": "console", "crm.maha-hub.com": "crm", "sales.maha-hub.com": "crm" };
export const systemOf = (...urls) => {
  for (const u of urls) { try { const h = new URL(String(u || "")).hostname.toLowerCase(); if (HOSTS[h]) return HOSTS[h]; } catch { /* not an address */ } }
  return "default";
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const F = "font-family:Segoe UI,Helvetica,Arial,sans-serif";

// Same card used by the in-app "type a code" pop-up (mfa2Open in ecosystem/index.html): left-aligned logo+name
// row, a status badge, a left-aligned heading and body, then the code box or button. Only the markup differs
// (email clients need tables and inline styles, no flex/animation) - the look, colours and wording match.
const shell = (S, preheader, badge, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(S.name)}</title></head>
<body style="margin:0;padding:0;background:#eef3f0;${F}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef3f0;font-size:1px;line-height:1px">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f0"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#eceff0;border-radius:24px;overflow:hidden">
<tr><td style="padding:28px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="52" valign="middle"><img src="${S.logo}" width="52" height="52" alt="${esc(S.name)}" style="display:block;border:0;border-radius:14px"></td>
<td valign="middle" style="padding-left:12px;${F}"><div style="font-size:17px;line-height:21px;font-weight:800;color:#0f5a44;letter-spacing:1px">${esc(S.name)}</div><div style="font-size:10px;line-height:14px;font-weight:600;color:#5d7a6c;letter-spacing:2px;margin-top:3px">GROUP OF COMPANIES</div></td></tr></table></td></tr>
<tr><td style="padding:16px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid #cfe6da;background:#f3faf6;border-radius:999px;padding:5px 12px 5px 10px;${F}">
<span style="font-size:11px;line-height:14px;font-weight:700;letter-spacing:.5px;color:#0f5a44;text-transform:uppercase">&#9679; ${esc(badge)}</span></td></tr></table></td></tr>
${body}
<tr><td style="padding:20px 32px 26px;${F};font-size:11.5px;line-height:18px;color:#9aa39d;text-align:center;border-top:1px solid #dfe5e2;margin-top:8px"><div style="padding-top:18px;font-weight:700;color:#41514a">&copy; 2026 Maha Hub Group of Companies Limited.<br>All rights reserved.</div><div style="margin-top:6px">Bangkok, Thailand (Head Office). This is an automatic security message, please do not reply.</div></td></tr>
</table></td></tr></table></body></html>`;

const warn = `<tr><td style="padding:22px 32px 6px;${F}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#f3f6f4;border-left:4px solid #0A3020;border-radius:8px;padding:14px 16px;font-size:12.5px;line-height:20px;color:#6b776f"><b style="color:#132b22">Did not ask for this?</b><br>Do not share this email or its code or link with anyone. If it was not you, you can ignore it, or tell your manager or Maha Hub support.</td></tr></table></td></tr>`;

const codeEmail = (S, code) => ({
  subject: `Your ${S.name} sign-in code`,
  html: shell(S, `Your ${S.name} sign-in code is ${code}. It is valid for 10 minutes.`, "Two-step sign-in", `
<tr><td style="padding:16px 32px 6px;${F};color:#132b22"><div style="font-size:22px;line-height:28px;font-weight:800;margin:0 0 8px">Verify it&rsquo;s you</div>
<div style="font-size:13.5px;line-height:22px;color:#6b776f">We received a sign-in to your ${esc(S.name)} account from a new device, or it is time for your regular security check. Enter this code on the ${esc(S.page)}.</div></td></tr>
<tr><td style="padding:14px 32px 0;${F}"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#6b776f;text-transform:uppercase;margin:0 0 8px">Your sign-in code</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="background:#ffffff;border:1.5px solid #c7d0cb;border-radius:14px;padding:16px 12px">
<div style="font-family:Consolas,Menlo,Courier New,monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:9px;color:#132b22;padding-left:9px">${esc(code)}</div></td></tr></table>
<div style="font-size:12.5px;line-height:19px;color:#9aa39d;margin-top:10px">This code is valid for <b style="color:#132b22">10 minutes</b> and can be used only once.</div></td></tr>
<tr><td style="padding:18px 32px 0;${F};color:#6b776f;font-size:13.5px;line-height:21px">1. Go back to the ${esc(S.page)}.<br>2. Type the 6-digit code above.<br>3. Tick <i>&ldquo;Register this device&rdquo;</i> only on your own computer.</td></tr>${warn}`),
  text: `Your ${S.name} sign-in code: ${code}\n\nEnter it on the ${S.page}. It is valid for 10 minutes and works once. If you did not try to sign in, ignore this email and do not share the code.\n\nMaha Hub Group of Companies Limited, Bangkok, Thailand (Head Office)`,
});

const linkEmail = (S, link, kind, username) => {
  const isNew = kind === "invite" || kind === "signup";
  const title = isNew ? `Welcome to ${S.name}` : "Set your password";
  const intro = isNew ? `An account was created for you on ${S.name}. Press the button to choose your password and start.` : `Press the button to choose a new password for your ${S.name} account.`;
  const badge = isNew ? "Account invitation" : "Password reset";
  return {
    subject: isNew ? `Your ${S.name} account is ready: set your password` : `Set your ${S.name} password`,
    html: shell(S, `${title}. The link works once.`, badge, `
<tr><td style="padding:16px 32px 6px;${F};color:#132b22"><div style="font-size:22px;line-height:28px;font-weight:800;margin:0 0 8px">${esc(title)}</div><div style="font-size:13.5px;line-height:22px;color:#6b776f">${esc(intro)}</div>
${username ? `<div style="margin-top:14px;background:#ffffff;border:1px solid #c7d0cb;border-radius:14px;padding:12px 16px"><div style="font-size:11px;line-height:15px;font-weight:700;letter-spacing:1px;color:#6b776f;text-transform:uppercase;margin-bottom:5px">Your username</div><div style="font-size:18px;line-height:24px;font-weight:800;color:#132b22;word-break:break-all">${esc(username)}</div></div>` : ""}</td></tr>
<tr><td align="center" style="padding:22px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="background:#0A3020;border-radius:14px">
<a href="${esc(link)}" style="display:block;${F};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 30px">Set my password</a></td></tr></table>
<div style="${F};font-size:12.5px;line-height:19px;color:#9aa39d;margin-top:12px">The link works <b style="color:#132b22">once</b> and for a short time.</div></td></tr>
<tr><td style="padding:14px 32px 0;${F};font-size:12px;line-height:18px;color:#9aa39d;word-break:break-all">If the button does not open, copy this address into your browser:<br><span style="color:#5d7a6c">${esc(link)}</span></td></tr>${warn}`),
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
