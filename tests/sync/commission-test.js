/* Agent commission. The provider sets, per hotel and per agent, whether the user types the GROSS rate or the NET rate.
   What is posted to the folio is always the rate typed; the boxes beside it show the commission and the gross rate.
     node tests/sync/commission-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Agent commission'), b = src.indexOf('/* ---- end Agent commission ---- */');
if (a < 0 || b < 0) throw new Error('commission code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const r2 = v => Math.round(v * 100) / 100;
const m2 = v => v.toFixed(2);
let rf = 0;
const X = new Function('r2', 'm2', 'rateFor', src.slice(a, b) + '\nreturn {commPct,commBasis,commCalc,commBoxes,resComm,nightRate,billRate,commTotals,totalBoxes};')(r2, m2, () => rf);

const gross = { comm: 15, rateBasis: 'gross' }, agoda = { comm: 18, rateBasis: 'net' };

/* the example: Agoda 18%, the booking says 1,230 net per night, 6 nights, the guest pays 1,500 per night (9,000) */
let k = X.commCalc(1230, agoda);
T('NET agent 18%: typed 1,230 -> gross 1,500, commission 270', k.typed === 1230 && k.gross === 1500 && k.comm === 270 && k.net === 1230, JSON.stringify(k));
let bx = X.commBoxes(1230, agoda);
T('NET agent: commission box shows 18% and 270.00, the next box shows the gross 1,500.00', bx.cLabel === 'Commission per night 18%' && bx.cVal === '270.00' && bx.nLabel === 'Gross rate per night' && bx.nVal === '1500.00', JSON.stringify(bx));
const six = [1230, 1230, 1230, 1230, 1230, 1230];
let tt = X.totalBoxes(six, agoda);
T('NET agent, 6 nights: total rate 7,380, total commission 1,620, total gross rate 9,000', tt.rVal === '7380.00' && tt.cLabel === 'Total commission 18%' && tt.cVal === '1620.00' && tt.nLabel === 'Total gross rate' && tt.nVal === '9000.00', JSON.stringify(tt));

/* gross agent: typed is the gross; the commission is what the hotel pays back; the other box is the net the hotel keeps */
k = X.commCalc(1600, gross);
T('GROSS agent 15%: typed 1,600 -> gross 1,600, commission 240, net 1,360', k.typed === 1600 && k.gross === 1600 && k.comm === 240 && k.net === 1360, JSON.stringify(k));
bx = X.commBoxes(1600, gross);
T('GROSS agent: commission 15% = 240.00, the next box shows the NET rate 1,360.00', bx.cLabel === 'Commission per night 15%' && bx.cVal === '240.00' && bx.nLabel === 'Net rate per night' && bx.nVal === '1360.00', JSON.stringify(bx));
tt = X.totalBoxes([1600, 1600, 1600], gross);
T('GROSS agent, 3 nights: total rate 4,800, total commission 720, total NET rate 4,080', tt.rVal === '4800.00' && tt.cVal === '720.00' && tt.nLabel === 'Total net rate' && tt.nVal === '4080.00', JSON.stringify(tt));

/* no commission */
for (const c of [null, undefined, {}, { comm: 0 }, { comm: '' }, { comm: -5 }, { comm: 100 }, { comm: 'abc' }, { comm: 0, rateBasis: 'net' }]) {
  const d = X.commBoxes(3000, c), t = X.totalBoxes([3000, 3000], c);
  T('no commission (' + JSON.stringify(c) + '): dashes, and the typed rate stays', d.cVal === '-' && d.nVal === '-' && d.pct === 0 && t.rVal === '6000.00' && t.cVal === '-' && X.commCalc(3000, c).gross === 3000);
}
T('an agent with no basis set behaves as gross', X.commBasis({ comm: 10 }) === 'gross' && X.commBasis({ comm: 10, rateBasis: 'weird' }) === 'gross' && X.commBasis({ comm: 10, rateBasis: 'net' }) === 'net');
T('rate not typed yet shows 0.00, not an error', X.commBoxes(0, agoda).cVal === '0.00' && X.commBoxes(0, agoda).nVal === '0.00');

/* rounding: every night is rounded on its own, and the totals add those nights */
const odd = X.commTotals([1234.56, 999.99, 1000.01], { comm: 12.5, rateBasis: 'net' });
const g1 = X.commCalc(1234.56, { comm: 12.5, rateBasis: 'net' }), g2 = X.commCalc(999.99, { comm: 12.5, rateBasis: 'net' }), g3 = X.commCalc(1000.01, { comm: 12.5, rateBasis: 'net' });
T('totals add the nights as each night is calculated (no rounding drift)', odd.typed === 3234.56 && odd.gross === r2(g1.gross + g2.gross + g3.gross) && odd.comm === r2(g1.comm + g2.comm + g3.comm) && r2(odd.gross - odd.comm) === odd.typed, JSON.stringify(odd));
T('no nights gives zero totals', X.totalBoxes([], agoda).rVal === '0.00');

/* a reservation keeps the terms it was made with */
const hotel = { companies: [{ id: 'c1', comm: 15, rateBasis: 'net' }] };
T('reservation with saved terms uses them, even if the agent changes later',
  X.resComm(hotel, { companyId: 'c1', commPct: 10, commBasis: 'gross' }).comm === 10 && X.commBasis(X.resComm(hotel, { companyId: 'c1', commPct: 10, commBasis: 'gross' })) === 'gross');
T('an older reservation (no saved terms) falls back to the agent as it is now', X.resComm(hotel, { companyId: 'c1' }).comm === 15);
T('a reservation saved with 0% stays 0%', X.commPct(X.resComm(hotel, { companyId: 'c1', commPct: 0, commBasis: 'gross' })) === 0);
T('no company means no commission', X.resComm(hotel, { companyId: 'zzz' }) === null && X.commPct(X.resComm(hotel, {})) === 0);

/* what is posted and invoiced: ALWAYS the typed rate, Gross or Net, whatever the commission */
const h2 = { companies: [{ id: 'n1', comm: 18, rateBasis: 'net' }, { id: 'g1', comm: 15, rateBasis: 'gross' }], reservations: [] };
const bN = { nightly: { '2026-10-10': 1230, '2026-10-11': 1230 } }, bG = { nightly: { '2026-10-10': 1600 } }, bD = { nightly: { '2026-10-10': 1000 } };
T('NET agent: typed 1230 is posted as 1230 every night', X.billRate(bN, '2026-10-10', h2) === 1230 && X.billRate(bN, '2026-10-11', h2) === 1230);
T('GROSS agent: typed 1600 is posted as 1600', X.billRate(bG, '2026-10-10', h2) === 1600);
T('no commission: posted as typed', X.billRate(bD, '2026-10-10', h2) === 1000);
T('a night with no rate posts 0', X.billRate(bN, '2026-12-01', h2) === 0);
T('changing the agent commission never changes what is posted', (h2.companies[0].comm = 40, X.billRate(bN, '2026-10-10', h2) === 1230));
T('the stay total is the sum of the typed nightly rates', X.billRate(bN, '2026-10-10', h2) + X.billRate(bN, '2026-10-11', h2) === 2460);

/* a new night follows the rate already agreed, never a standard rate */
T('a new night follows the latest night already agreed', X.nightRate({}, { nightly: { '2026-10-10': 2000, '2026-10-11': 2400 } }) === 2400);
T('zero nights (comp or house) are skipped when finding the agreed rate', X.nightRate({}, { nightly: { '2026-10-10': 2000, '2026-10-11': 0 } }) === 2000);
T('with nothing agreed yet and no standard rate it is 0 (the user must type one)', X.nightRate({}, { nightly: {} }) === 0);
rf = 1500;
T('an older hotel that still has a stored base rate falls back to it only when nothing is agreed', X.nightRate({}, { nightly: {} }) === 1500 && X.nightRate({}, { nightly: { d: 900 } }) === 900);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
