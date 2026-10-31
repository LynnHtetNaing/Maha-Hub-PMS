/* Security headers file: the Content-Security-Policy is enforced and allows what the PMS really uses.
     node tests/sync/headers-test.js _headers */
const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const line = (h.split('\n').find(l => /^\s*Content-Security-Policy:/.test(l)) || '');
T('the Content-Security-Policy is enforced (not report-only)', !!line && !/Report-Only:/i.test(h.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')));
T('it allows Supabase (https and wss), Stripe, the AI services and Cloudflare analytics', ['https://wragaoglvksbbgmfjyzp.supabase.co', 'wss://wragaoglvksbbgmfjyzp.supabase.co', 'https://api.stripe.com', 'https://generativelanguage.googleapis.com', 'https://api.anthropic.com', 'https://static.cloudflareinsights.com', 'https://cloudflareinsights.com'].every(x => line.includes(x)));
T('it still blocks framing, plugins and foreign form posts', line.includes("frame-ancestors 'none'") && line.includes("object-src 'none'") && line.includes("base-uri 'self'") && line.includes("form-action 'self' https://checkout.stripe.com"));
T('the other security headers stay', ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy', 'Permissions-Policy'].every(x => h.includes(x)));
process.exit(fails ? 1 : 0);
