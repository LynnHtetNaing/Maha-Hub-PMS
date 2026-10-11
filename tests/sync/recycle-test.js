/* Recycle bin for deleted hotels: kept 30 days, restorable, then removed for good.
     node tests/sync/recycle-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Recycle bin'), b = src.indexOf('/* ---- end Recycle bin ---- */');
if (a < 0 || b < 0) throw new Error('recycle code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {recycleDays,hotelCounts,recycleAdd,recyclePurge,recycleDaysLeft,recycleRestore,recycleForget};')();
const DAY = 864e5, t0 = Date.UTC(2026, 9, 11);
const hotel = (code, users) => ({ code, set: { name: 'Hotel ' + code }, rooms: [{ no: '1' }, { no: 'D9', dummy: true }], reservations: [{}, {}], guests: [{}], users: users || [{ username: code.toLowerCase() + '.owner' }], invoices: [{}], shifts: [{ status: 'open' }, { status: 'closed' }] });
const db = () => ({ hotels: { A1: hotel('A1'), B2: hotel('B2') }, recycle: [] });

let d = db();
const e = X.recycleAdd(d, d.hotels.A1, 'mahaadmin', t0);
T('a deleted hotel leaves the hotel list and goes to the Recycle bin with all its data', !d.hotels.A1 && d.hotels.B2 && d.recycle.length === 1 && e.hotel.rooms.length === 2 && e.code === 'A1');
T('it is kept for exactly 30 days', X.recycleDays() === 30 && e.purgeAt - e.deletedAt === 30 * DAY);
T('what was deleted and by whom is recorded', e.by === 'mahaadmin' && e.counts.rooms === 1 && e.counts.reservations === 2 && e.counts.guests === 1 && e.counts.staff === 1 && e.counts.invoices === 1 && e.counts.openShifts === 1, JSON.stringify(e.counts));
T('days left counts down', X.recycleDaysLeft(e, t0) === 30 && X.recycleDaysLeft(e, t0 + 10 * DAY) === 20 && X.recycleDaysLeft(e, t0 + 29.5 * DAY) === 1 && X.recycleDaysLeft(e, t0 + 40 * DAY) === 0);

T('nothing is purged before 30 days', X.recyclePurge(d, t0 + 29 * DAY) === 0 && d.recycle.length === 1);
T('on the 30th day it is permanently removed', X.recyclePurge(d, t0 + 30 * DAY) === 1 && d.recycle.length === 0);

d = db(); X.recycleAdd(d, d.hotels.A1, 'x', t0); X.recycleAdd(d, d.hotels.B2, 'x', t0 + 20 * DAY);
T('purging removes only the expired ones', X.recyclePurge(d, t0 + 35 * DAY) === 1 && d.recycle.length === 1 && d.recycle[0].code === 'B2');

/* restore */
d = db(); const e2 = X.recycleAdd(d, d.hotels.A1, 'x', t0);
let r = X.recycleRestore(d, e2.id, () => false);
T('restore puts the hotel back exactly as it was', r.ok && d.hotels.A1 === e2.hotel && d.recycle.length === 0 && d.hotels.A1.reservations.length === 2);
d = db(); const e3 = X.recycleAdd(d, d.hotels.A1, 'x', t0); d.hotels.A1 = hotel('A1');
r = X.recycleRestore(d, e3.id, () => false);
T('restore is refused when a hotel with that code exists now, and nothing is lost', !r.ok && r.why === 'code-used' && d.recycle.length === 1);
d = db(); const e4 = X.recycleAdd(d, d.hotels.A1, 'x', t0);
r = X.recycleRestore(d, e4.id, u => u === 'a1.owner');
T('restore is refused when a staff username is used elsewhere now', !r.ok && r.why === 'username-used' && r.username === 'a1.owner' && d.recycle.length === 1 && !d.hotels.A1);
T('restoring something that is not there is refused', X.recycleRestore(d, 'nope', () => false).why === 'not-found');

/* delete permanently */
d = db(); const e5 = X.recycleAdd(d, d.hotels.A1, 'x', t0); X.recycleAdd(d, d.hotels.B2, 'x', t0);
T('permanent delete removes just that item', X.recycleForget(d, e5.id) === 1 && d.recycle.length === 1 && d.recycle[0].code === 'B2' && X.recycleForget(d, e5.id) === 0);

/* old saved data without the list */
const old = { hotels: { A1: hotel('A1') } };
T('saved data from before the Recycle bin works', X.recyclePurge(old, t0) === 0 && Array.isArray(old.recycle) && X.recycleAdd(old, old.hotels.A1, 'x', t0).code === 'A1');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);