/* Agent commission: what the reservation shows for the gross rate typed by the user, per agent set-up by the provider.
     node tests/sync/commission-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Agent commission'), b = src.indexOf('/* ---- end Agent commission ---- */');
if (a < 0 || b < 0) throw new Error('commission code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const r2 = v => Math.round(v * 100) / 100;
const m2 = v => v.toFixed(2);
const X = new Function('r2', 'm2', 'rateFor', src.slice(a, b) + '\nreturn {commPct,commBasis,commCalc,commBoxes,resComm,nightRate};')(r2, m2, () => 0);

const gross = { comm: 15, rateBasis: 'gross' }, net = { comm: 15, rateBasis: 'net' };
T('15% of a 3,000 gross rate is 450, net 2,550', X.commCalc(3000, net).comm === 450 && X.commCalc(3000, net).net === 2550);
T('amounts are rounded to 2 decimals', X.commCalc(1234.56, { comm: 12.5 }).comm === 154.32 && X.commCalc(1234.56, { comm: 12.5 }).net === 1080.24);

/* the two boxes next to the rate the user typed */
let bx = X.commBoxes(3000, net);
T('NET agent: commission box shows the amount, the next box shows the NET rate', bx.cLabel === 'Commission 15%' && bx.cVal === '450.00' && bx.nLabel === 'Net rate' && bx.nVal === '2550.00', JSON.stringify(bx));
bx = X.commBoxes(3000, gross);
T('GROSS agent: the next box shows the gross rate as typed, and the commission to pay back', bx.cVal === '450.00' && bx.nLabel === 'Gross rate' && bx.nVal === '3000.00', JSON.stringify(bx));
for (const c of [null, undefined, {}, { comm: 0 }, { comm: '' }, { comm: -5 }, { comm: 100 }, { comm: 'abc' }]) {
  const d = X.commBoxes(3000, c);
  T('no commission (' + JSON.stringify(c) + ') shows a dash in both boxes', d.cVal === '-' && d.nVal === '-' && d.pct === 0);
}
T('an agent with no basis set behaves as gross', X.commBasis({ comm: 10 }) === 'gross' && X.commBasis({ comm: 10, rateBasis: 'weird' }) === 'gross' && X.commBasis({ comm: 10, rateBasis: 'net' }) === 'net');
bx = X.commBoxes(0, net);
T('rate not typed yet shows 0.00, not an error', bx.cVal === '0.00' && bx.nVal === '0.00');

/* a reservation keeps the terms it was made with */
const hotel = { companies: [{ id: 'c1', comm: 15, rateBasis: 'net' }] };
T('reservation with saved terms uses them, even if the agent changes later',
  X.resComm(hotel, { companyId: 'c1', commPct: 10, commBasis: 'gross' }).comm === 10 && X.commBasis(X.resComm(hotel, { companyId: 'c1', commPct: 10, commBasis: 'gross' })) === 'gross');
T('an older reservation (no saved terms) falls back to the agent as it is now', X.resComm(hotel, { companyId: 'c1' }).comm === 15);
T('a reservation saved with 0% stays 0% (not replaced by the agent today)', X.commPct(X.resComm(hotel, { companyId: 'c1', commPct: 0, commBasis: 'gross' })) === 0);
T('no company means no commission', X.resComm(hotel, { companyId: 'zzz' }) === null && X.commPct(X.resComm(hotel, {})) === 0);

/* a new night follows the rate already agreed, never a standard rate */
let rf = 0;
const Y = new Function('r2', 'm2', 'rateFor', src.slice(a, b) + '\nreturn {nightRate};')(r2, m2, () => rf);
T('a new night follows the latest night already agreed', Y.nightRate({}, { nightly: { '2026-10-10': 2000, '2026-10-11': 2400 } }) === 2400);
T('zero nights (comp or house) are skipped when finding the agreed rate', Y.nightRate({}, { nightly: { '2026-10-10': 2000, '2026-10-11': 0 } }) === 2000);
T('with nothing agreed yet and no standard rate it is 0 (the user must type one)', Y.nightRate({}, { nightly: {} }) === 0);
rf = 1500;
T('an older hotel that still has a stored base rate falls back to it only when nothing is agreed', Y.nightRate({}, { nightly: {} }) === 1500 && Y.nightRate({}, { nightly: { d: 900 } }) === 900);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
