/* Subscription card screens after sign-in, before Select System: the user's own access period (only that user) and the hotel subscription date (every user of the hotel).
     node tests/sync/subscription-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf('const SUB_WARN_DAYS=30,'), b = src.indexOf('function subScreen(', a);
const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const P = s => new Date(s + 'T00:00:00'), diff = (x, y) => Math.round((P(y) - P(x)) / 864e5);
const accessSpan = ms => { const d = Math.floor(ms / 864e5); return d >= 1 ? d + ' d' : 'hours' };
const fd = s => s;
const lib = new Function('fd', 'iso', 'diff', 'accessSpan', 'P', src.slice(a, b) + ';return {subNotices,subCardInfo,fdOrd}')(fd, iso, diff, accessSpan, P);
const subNotices = lib.subNotices;
const day = 864e5, now = Date.now(), plus = n => iso(new Date(now + n * day));
const kinds = (h, u) => subNotices(h, u).map(n => n.k + (n.late ? ':late' : ':soon')).join(',');
const hotel = d => ({ set: d ? { subUntil: d } : {} });
const user = d => ({ access: d == null ? undefined : { until: now + d * day } });

T('nothing to say when there is no date and no end', kinds(hotel(), user()) === '');
T('user access ending in 12 days: a notice for that user (not red yet)', kinds(hotel(), user(12)) === 'user:soon');
T('user access ending in 5 days: red', kinds(hotel(), user(5)) === 'user:late');
T('user access ending in 40 days: no notice yet (it starts 30 days before)', kinds(hotel(), user(40)) === '');
T('a provider account never gets the user notice', kinds(hotel(), { provider: true, access: { until: now + 3 * day } }) === '');
T('hotel subscription in 20 days: a notice for every user of the hotel', kinds(hotel(plus(20)), user()) === 'hotel:soon');
T('hotel subscription in 3 days: red', kinds(hotel(plus(3)), user()) === 'hotel:late');
T('hotel subscription today: card says it ends today', lib.subCardInfo(subNotices(hotel(plus(0)), user())[0], { code: 'X' }).left === 'Ends today');
T('hotel subscription already ended: red notice, still only a warning', kinds(hotel(plus(-4)), user()) === 'hotel:late' && lib.subCardInfo(subNotices(hotel(plus(-4)), user())[0], { code: 'X' }).title === 'Expired');
T('hotel subscription in 60 days: no notice yet', kinds(hotel(plus(60)), user()) === '');
T('both at once: the user notice first, then the hotel notice', kinds(hotel(plus(10)), user(10)) === 'user:soon,hotel:soon');
T('hotel card: Expiring Soon, ordinal date, Renew Now, property code; user card: Contact provider and tells the person to ask the provider', (() => { const h = lib.subCardInfo(subNotices(hotel(plus(10)), user())[0], { code: 'HX' }), u = lib.subCardInfo(subNotices(hotel(), user(10))[0], { code: 'HX' }); return h.title === 'Expiring Soon' && /expires on [0-9]+(st|nd|rd|th) /.test(h.headline) && h.btn === 'Renew Now' && h.code === 'HX' && u.btn === 'Contact provider' && /provider/i.test(u.sub) && /extend/i.test(u.sub); })());
T('ordinal dates: 1st 2nd 3rd 4th 11th 12th 21st', ['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-11','2026-11-12','2026-11-21'].map(lib.fdOrd).every((x,i)=>x.startsWith(['1st','2nd','3rd','4th','11th','12th','21st'][i]+' Nov')));

/* wiring */
T('the screens run once after sign-in, before Frontend / Backend, and the old inline notice is gone', /async function chooseAreaAndEnter\(props,welcome\)\{\s+await showSubscriptionScreens\(\);/.test(src) && !src.includes('subNoticesHtml') && !src.includes('sp-note'));
T('card: amber then red, Light and Dark (soft red in Dark, no gold), X and Esc close it, Renew opens the support page', src.includes('.selpg .sp-exp.late .sp-exph{') && src.includes('.selpg.dark .sp-exp.soon .sp-exph') && src.includes("e.key==='Escape'") && src.includes('id="spExpX"') && src.includes("window.open(RENEW_URL,'_blank','noopener')"));
T('Provider console > Hotels: a Subscription until column, a Subscription button, a date box with Save and Clear, logged and saved', src.includes('<th>Subscription until</th>') && src.includes('data-sub="${h.code}">Subscription</button>') && src.includes("h.set.subUntil=v;provLog('Subscription of hotel '+h.code+' valid until '") && src.includes("delete h.set.subUntil;provLog('Subscription date cleared for hotel '"));
T('the hotel date never blocks sign-in (the sign-in code does not read it)', !/subUntil/.test(src.slice(src.indexOf('function doLogin()'), src.indexOf('function doLogin()') + 6000)));
process.exit(fails ? 1 : 0);
