/* Recycle bin (cloud): how the list from the server is read.
     node tests/sync/recycle-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Recycle bin (cloud)'), b = src.indexOf('/* ---- end Recycle bin (cloud) ---- */');
if (a < 0 || b < 0) throw new Error('recycle code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {recycleRows};')();
const DAY = 864e5, now = Date.UTC(2026, 9, 11, 12, 0, 0);
const iso = ms => new Date(ms).toISOString();
const row = (code, deleted, purge, extra) => Object.assign({ property_id: 'id-' + code, property_code: code, name: 'Hotel ' + code, deleted_at: iso(deleted), purge_at: iso(purge), deleted_by: 'mahaadmin', records: 120, staff: 3 }, extra || {});

let r = X.recycleRows([row('A1', now - 10 * DAY, now + 20 * DAY)], now);
T('days left counts down from the 30 days', r.length === 1 && r[0].daysLeft === 20 && !r[0].expired && r[0].code === 'A1' && r[0].records === 120 && r[0].staff === 3 && r[0].by === 'mahaadmin', JSON.stringify(r[0]));
r = X.recycleRows([row('A1', now, now + 30 * DAY)], now);
T('a hotel deleted just now has 30 days', r[0].daysLeft === 30);
r = X.recycleRows([row('A1', now - 29.5 * DAY, now + 0.5 * DAY)], now);
T('part of a day left counts as 1 day, not expired', r[0].daysLeft === 1 && !r[0].expired);
r = X.recycleRows([row('A1', now - 31 * DAY, now - DAY)], now);
T('after the 30 days it is expired with 0 days left', r[0].expired && r[0].daysLeft === 0);
r = X.recycleRows([row('A1', now - 31 * DAY, now)], now);
T('exactly at the end it counts as expired', r[0].expired);
r = X.recycleRows([row('OLD', now - 20 * DAY, now + 10 * DAY), row('NEW', now - DAY, now + 29 * DAY), row('MID', now - 5 * DAY, now + 25 * DAY)], now);
T('newest deletion first', r.map(x => x.code).join() === 'NEW,MID,OLD');
T('an empty or invalid answer gives an empty list', X.recycleRows(null, now).length === 0 && X.recycleRows(undefined, now).length === 0 && X.recycleRows({}, now).length === 0 && X.recycleRows([], now).length === 0);
r = X.recycleRows([{ property_code: 'Z9', deleted_at: iso(now), purge_at: iso(now + 30 * DAY) }], now);
T('missing fields do not break the list', r[0].name === 'Z9' && r[0].by === '' && r[0].records === 0 && r[0].staff === 0);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);