/* Close Day: occupied rooms become dirty (OC to OD), Do Not Disturb stays, out of order and dummy rooms are not touched.
     node tests/sync/closeday-dirty-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const a = src.indexOf('function closeDayDirty('), b = src.indexOf('function runCloseDay(', a);
if (a < 0 || b < 0) throw new Error('code not found');
const run = (rooms, bookings) => { const H = { rooms }; new Function('H', 'allBookings', src.slice(a, b) + '\nreturn closeDayDirty;')(H, () => bookings)('2026-10-26'); return H; };
const rooms = [
  { no: '101', hk: 'clean' }, { no: '102', hk: 'inspected' }, { no: '103', hk: 'clean', dnd: 'dnd' }, { no: '104', hk: 'clean' },
  { no: '105', hk: 'clean', ooo: { from: '2026-10-25', to: '2026-10-30', kind: 'OO' } }, { no: 'D001', hk: 'clean', dummy: true }, { no: '106', hk: 'dirty' }, { no: '107', hk: 'clean' }];
const bookings = [{ room: '101', status: 'inhouse' }, { room: '102', status: 'inhouse' }, { room: '103', status: 'inhouse' }, { room: '105', status: 'inhouse' }, { room: 'D001', status: 'inhouse' }, { room: '106', status: 'inhouse' }, { room: '107', status: 'confirmed' }];
const H = run(rooms.map(r => ({ ...r })), bookings), g = n => H.rooms.find(r => r.no === n);
T('a clean occupied room becomes dirty', g('101').hk === 'dirty');
T('an inspected occupied room becomes dirty', g('102').hk === 'dirty');
T('a Do Not Disturb occupied room becomes dirty and keeps its DND', g('103').hk === 'dirty' && g('103').dnd === 'dnd');
T('a vacant clean room stays clean', g('104').hk === 'clean');
T('an out of order room is not touched', g('105').hk === 'clean');
T('a dummy room is not touched', g('D001').hk === 'clean');
T('a room that is already dirty stays dirty', g('106').hk === 'dirty');
T('a room with only a confirmed booking is not changed', g('107').hk === 'clean');
T('Close Day calls it and records it in the log', /const nd2=closeDayDirty\(bd\)/.test(src) && /occupied room.*set to dirty/.test(src));
process.exit(fails ? 1 : 0);
