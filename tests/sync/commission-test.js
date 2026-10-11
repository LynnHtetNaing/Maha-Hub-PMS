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
const X = new Function('r2', 'm2', 'rateFor', src.slice(a, b) + '\nreturn {commPct,commBasis,commCalc,commBoxes,resComm,nightRate,billedOf,billRate};')(r2, m2, () => 0);

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

/* what is billed: folio postings, stay total, invoices and reports all read billRate */
T('a Net agent is billed the net rate', X.billedOf(3000, net) === 2550);
T('a Gross agent is billed the rate as typed', X.billedOf(3000, gross) === 3000);
T('no commission is billed as typed (also when marked Net)', X.billedOf(3000, null) === 3000 && X.billedOf(3000, { comm: 0, rateBasis: 'net' }) === 3000);
const h2 = { companies: [{ id: 'n1', comm: 15, rateBasis: 'net' }, { id: 'g1', comm: 15, rateBasis: 'gross' }], reservations: [] };
const bN = { nightly: { '2026-10-10': 2000, '2026-10-11': 3000 } }, bG = { nightly: { '2026-10-10': 2000 } }, bD = { nightly: { '2026-10-10': 1000 } };
h2.reservations.push({ id: 'rN', companyId: 'n1', commPct: 15, commBasis: 'net', bookings: [bN] }, { id: 'rG', companyId: 'g1', bookings: [bG] }, { id: 'rD', companyId: 'zz', bookings: [bD] });
T('nightly postings for a Net agent reservation: each night at its net rate, total auto-calculated',
  X.billRate(bN, '2026-10-10', h2) === 1700 && X.billRate(bN, '2026-10-11', h2) === 2550 && X.billRate(bN, '2026-10-10', h2) + X.billRate(bN, '2026-10-11', h2) === 4250);
T('Gross agent and direct reservations are posted as typed', X.billRate(bG, '2026-10-10', h2) === 2000 && X.billRate(bD, '2026-10-10', h2) === 1000);
T('a night with no rate bills 0', X.billRate(bN, '2026-12-01', h2) === 0);
bN.nightly['2026-10-10'] = 2200;
T('changing the typed rate changes what is billed for that night only', X.billRate(bN, '2026-10-10', h2) === 1870 && X.billRate(bN, '2026-10-11', h2) === 2550);
h2.companies[0].comm = 30;
T('a later change of the agent commission does not change a reservation made with the old terms', X.billRate(bN, '2026-10-10', h2) === 1870);
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
