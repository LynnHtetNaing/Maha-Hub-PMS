/* Subscription card screens after sign-in, before Select System, and the stop at 06:00 the next morning.
   Hotel: warning from 10 days before. User: warning from 3 days before. Both stop at 06:00 the day after the expiry date.
   A provider extension clears it at once; a revoke stops at once.
     node tests/sync/subscription-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf('const SUB_STOP_HOUR=6;'), b = src.indexOf('function subScreen(', a);
const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const P = s => new Date(s + 'T00:00:00'), diff = (x, y) => Math.round((P(y) - P(x)) / 864e5);
const addD = (s, n) => { const d = P(s); d.setDate(d.getDate() + n); return iso(d) };
const tzp = t => { const d = new Date(t); return { y: String(d.getFullYear()), m: pad(d.getMonth() + 1), d: pad(d.getDate()), h: pad(d.getHours()), mi: pad(d.getMinutes()), s: pad(d.getSeconds()) } };
const ulDayStart = s => P(s).getTime(), ulTodayIn = () => iso(new Date()), dispZone = () => '', fd = s => s, tm = () => '', ic = () => '';
const lib = new Function('fd', 'tm', 'iso', 'diff', 'P', 'addD', 'tzp', 'ulDayStart', 'ulTodayIn', 'dispZone',
  src.slice(a, b) + ';return {subNotices,subCardInfo,fdOrd,accessCut,accessWhy,subStopped,stopAtDate}')(fd, tm, iso, diff, P, addD, tzp, ulDayStart, ulTodayIn, dispZone);
const day = 864e5, now = Date.now(), plus = n => addD(ulTodayIn(), n);
const kinds = (h, u) => lib.subNotices(h, u).map(n => n.k + (n.late ? ':late' : ':soon')).join(',');
const hotel = d => ({ set: d ? { subUntil: d } : {} });
const user = (d, term) => ({ username: 'u', access: d == null ? undefined : { until: now + d * day, term: term || '1 years' } });

T('nothing to say when there is no date and no end', kinds(hotel(), user()) === '');
/* user: warning from 3 days before */
T('user access ending in 2 days: a notice for that user (not red yet)', kinds(hotel(), user(2.2)) === 'user:soon');
T('user access ending today or tomorrow: red', kinds(hotel(), user(0.4)) === 'user:late');
T('user access ending in 5 or 40 days: no notice yet (it starts 3 days before)', kinds(hotel(), user(5)) === '' && kinds(hotel(), user(40)) === '');
T('a term of hours, or a term without a date length, gives no card (it stops at its exact moment)', kinds(hotel(), user(0.1, '2 hours')) === '' && kinds(hotel(), { access: { until: now + day } }) === '');
T('a provider account never gets the user notice', kinds(hotel(), { provider: true, access: { until: now + day, term: '1 years' } }) === '');
/* hotel: warning from 10 days before */
T('hotel subscription in 9 or 10 days: a notice for every user of the hotel', kinds(hotel(plus(9)), user()) === 'hotel:soon' && kinds(hotel(plus(10)), user()) === 'hotel:soon');
T('hotel subscription in 11, 20 or 60 days: no notice yet', kinds(hotel(plus(11)), user()) === '' && kinds(hotel(plus(20)), user()) === '' && kinds(hotel(plus(60)), user()) === '');
T('hotel subscription in 3 days: red', kinds(hotel(plus(3)), user()) === 'hotel:late');
T('hotel subscription today: the card says it ends today', lib.subCardInfo(lib.subNotices(hotel(plus(0)), user())[0], { code: 'X' }).left === 'Ends today');
T('both at once: the user notice first, then the hotel notice', kinds(hotel(plus(9)), user(2.2)) === 'user:soon,hotel:soon');
/* the stop moment */
const D = '2026-11-15', stop = lib.stopAtDate(D);
T('a hotel date stops at 06:00 the next morning: one minute before it is still open, at 06:00 it is stopped', stop === new Date('2026-11-16T06:00:00').getTime() && !lib.subStopped(hotel(D), stop - 60000) && lib.subStopped(hotel(D), stop));
T('a hotel revoke stops at once, and an extension (date set again, revoke removed) opens it again', lib.subStopped({ set: { subUntil: plus(30), subRevokedAt: now - 1 } }) === true && lib.subStopped({ set: { subUntil: plus(30) } }) === false && lib.subStopped({ set: {} }) === false);
const until = new Date('2026-11-15T12:00:00').getTime();
T('a user term by days stops at 06:00 the day after its date; hours, a revoke and a plain end stop at the exact moment', lib.accessCut(until, '1 years') === new Date('2026-11-16T06:00:00').getTime() && lib.accessCut(until, '2 hours') === until && lib.accessCut(until, 'revoked') === until && lib.accessCut(until) === until);
T('a signed-in user: still allowed at 05:59 the next morning, cut at 06:00', lib.accessWhy({ access: { until, term: '1 years' } }, new Date('2026-11-16T05:59:00').getTime()) === '' && lib.accessWhy({ access: { until, term: '1 years' } }, new Date('2026-11-16T06:00:00').getTime()) === 'ended');
const h1 = lib.subCardInfo({ k: 'hotel', late: false, ended: false, d: D, days: 5 }, { code: 'HX' }), u1 = lib.subCardInfo({ k: 'user', late: false, ended: false, d: D, days: 2, user: 'u' }, { code: 'HX' });
T('hotel card: Expiring Soon, ordinal date, Renew Now, property code and when it stops; user card: Contact provider and the same stop time', h1.title === 'Expiring Soon' && /expires on 15th Nov/.test(h1.headline) && h1.btn === 'Renew Now' && h1.code === 'HX' && h1.stops === 'Access stops at 6:00 AM on 16th Nov 2026.' && u1.btn === 'Contact provider' && /provider/i.test(u1.sub) && /extend/i.test(u1.sub) && u1.stops === h1.stops);
T('after the date the card says Expired', lib.subCardInfo({ k: 'hotel', late: true, ended: true, d: D, days: -1 }, { code: 'X' }).title === 'Expired');

/* wiring */
T('sign-in: a stopped hotel gets the stop screen (Renew Now, no way in); otherwise the cards run once before Frontend / Backend', src.includes("async function chooseAreaAndEnter(props,welcome){\n  if(DB.session&&!DB.session.provider&&subStopped(H)){await subBlockScreen(H);return}\n  await showSubscriptionScreens();") && !src.includes('subNoticesHtml') && !src.includes('sp-note'));
T('while working: every 5 seconds a stopped hotel or an ended user is signed out; a reloaded session of a stopped hotel is refused', src.includes("if(!SUB_BLOCK&&subStopped(H)){signOut(true,'Your hotel subscription has ended.") && src.includes('if(!u||u.active===false||accessWhy(u)||subStopped(h))return false;'));
T('card: amber then red, Light and Dark, X and Esc close it, Renew opens the Billing page', src.includes('.selpg .sp-exp.late .sp-exph{') && src.includes('.selpg.dark .sp-exp.soon .sp-exph') && src.includes("e.key==='Escape'") && src.includes('id="spExpX"') && src.includes("window.open(BILLING_URL+'?hotel='+encodeURIComponent(c.code),'_blank','noopener')"));
T('Provider console > Hotels: a Subscription until column, buttons, a date box with Save and Clear, logged and saved; a new date or extension removes a revoke', src.includes('<th>Subscription until</th>') && src.includes('data-sub="${h.code}">Subscription</button>') && src.includes("h.set.subUntil=v;delete h.set.subRevokedAt;provLog('Subscription of hotel '+h.code+' valid until '") && src.includes("delete h.set.subUntil;delete h.set.subRevokedAt;provLog('Subscription date cleared for hotel '") && src.includes("h.set.subUntil=v;delete h.set.subRevokedAt;provLog('Subscription of hotel '+h.code+' extended to '") && src.includes("h.set.subRevokedAt=Date.now();provLog('Subscription of hotel '+h.code+' revoked (stopped now)')"));
process.exit(fails ? 1 : 0);
