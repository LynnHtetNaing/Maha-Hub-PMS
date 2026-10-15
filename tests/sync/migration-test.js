/* Backup & migration: CSV reading/writing, one-hotel backup (no passwords), exports, and the import preview/apply.
     node tests/sync/migration-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Backup & migration (provider)');
const b = src.indexOf('/* ---- end Backup & migration ---- */');
if (a < 0 || b < 0) throw new Error('migration code not found');
const code = src.slice(a, b);
const ca = src.indexOf('/* ---- Agent commission'), cb = src.indexOf('/* ---- end Agent commission ---- */');
if (ca < 0 || cb < 0) throw new Error('commission code not found');
const commCode = src.slice(ca, cb);
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
let n = 0;
const X = new Function('uid', 'r2', 'm2', 'rateFor', 'function invRef(i){return i?(i.ref||String(i.no)):""}\n' + commCode + '\n' + code + '\nreturn {toCsv,parseCsv,csvObjects,hotelBackupObject,migExportCsv,MIG_EXPORTS,migPlan,migApply};')(() => 'x' + (++n), v => Math.round(v * 100) / 100, v => String(v), () => 0);

const hotel = () => ({
  code: 'H1', set: { name: 'Hotel One', nextProfile: 5 }, floors: [],
  roomTypes: [{ code: 'STD', name: 'Standard', base: 1500 }, { code: 'DUM', name: 'Dummy', base: 0, dummy: true }],
  rooms: [{ no: '101', type: 'STD', floor: '1' }, { no: 'D999', type: 'DUM', floor: 'D', dummy: true }],
  guests: [{ id: 'g1', profileId: 1, title: 'MR.', last: 'Smith', first: 'John', birthday: '1985-02-02', doc: { no: 'P1' } }, { id: 'gGRP', profileId: 'GROUP', last: 'Master', first: 'Group' }],
  companies: [{ id: 'c1', code: 'DIR', name: 'Direct' }],
  users: [{ id: 'u1', username: 'owner', hash: 'SECRET', salt: 'SALT', perms: [] }],
  reservations: [{ id: 'r1', no: 1001, companyId: 'c1', reference: 'R,ef "q"', bookings: [{ id: 'b1', internal: 1, guestId: 'g1', type: 'STD', room: '101', arr: '2026-10-10', dep: '2026-10-12', status: 'confirmed', rateCode: 'RO', nightly: { '2026-10-10': 1500, '2026-10-11': 1600 }, adults: 2, children: 0, remark: 'line1\nline2', lines: [{ folio: 1, bd: '2026-10-10', code: 'RM', desc: 'Room', amt: 1500, kind: 'post' }] }] }],
  invoices: [{ no: 1, bd: '2026-10-12', bookingId: 'b1', billTo: 'guest', amount: 3100 }]
});

/* CSV round trip with commas, quotes and line breaks inside a cell */
const rows = [['a', 'b,c', 'say "hi"', 'x\ny'], ['1', '', '3', '']];
const back = X.parseCsv(X.toCsv(rows));
T('CSV with commas, quotes and line breaks reads back exactly', JSON.stringify(back) === JSON.stringify(rows));
T('a leading byte-order mark and Windows line ends are handled', JSON.stringify(X.parseCsv('﻿a,b\r\n1,2\r\n')) === JSON.stringify([['a', 'b'], ['1', '2']]));
T('blank lines are ignored', X.parseCsv('a,b\n\n1,2\n\n').length === 2);
const o = X.csvObjects('Room No,Room-Type\n101, std ');
T('headers are matched in lower case with underscores, cells are trimmed', o.head.join() === 'room_no,room_type' && o.list[0].room_type === 'std');

/* backup file */
const h = hotel();
const bk = X.hotelBackupObject(h);
T('backup holds the hotel but no staff password material', bk.mahaHotelBackup === 1 && bk.hotel.rooms.length === 2 && !JSON.stringify(bk).includes('SECRET') && !JSON.stringify(bk).includes('SALT'));
T('making the backup leaves the live hotel untouched', h.users[0].hash === 'SECRET');

/* exports */
const g = X.parseCsv(X.migExportCsv(h, 'guests'));
T('guest export skips the internal group master record', g.length === 2 && g[1][2] === 'Smith');
const r = X.parseCsv(X.migExportCsv(h, 'reservations'));
T('reservation export gives dates, nights and the average rate', r.length === 2 && r[1][5] === '2026-10-10' && r[1][7] === '2' && r[1][10] === '1550' && r[1][22] === 'DIR' && r[1][23] === 'R,ef "q"');
T('multi-line remarks survive the export', r[1][24] === 'line1\nline2');
const f = X.parseCsv(X.migExportCsv(h, 'folio'));
T('folio export lists the postings', f.length === 2 && f[1][0] === '1001' && f[1][6] === '1500');
const iv = X.parseCsv(X.migExportCsv(h, 'invoices'));
T('invoice export links to the reservation number', iv[1][0] === '1' && iv[1][2] === '1001' && iv[1][4] === '3100');
const rm = X.parseCsv(X.migExportCsv(h, 'rooms'));
T('room export leaves out the hidden dummy room', rm.length === 2 && rm[1][0] === '101');

/* import: rooms */
let p = X.migPlan('rooms', h, X.csvObjects('room_no,room_type,floor,type_name,base_rate\n101,STD,1,,\n102,STD,1,,\n201,DLX,2,Deluxe,2500\n202,DLX,2,,\n301,SUP,3,,\n,STD,1,,').list);
T('rooms: existing skipped, new added, new type needs a rate, empty room number rejected',
  p.add.length === 3 && p.skip.length === 1 && p.err.length === 2 && p.newTypes.length === 1 && p.newTypes[0].code === 'DLX' && p.newTypes[0].base === 2500, JSON.stringify({ a: p.add.length, s: p.skip.length, e: p.err, t: p.newTypes }));
X.migApply('rooms', h, p);
T('rooms: applied with the new type and floor', h.rooms.length === 5 && h.roomTypes.some(t => t.code === 'DLX') && h.rooms.find(x => x.no === '201').type === 'DLX' && h.rooms.find(x => x.no === '102').hk === 'clean');
p = X.migPlan('rooms', h, X.csvObjects('room_no,room_type,floor\n102,STD,1').list);
T('rooms: loading the same file again adds nothing', p.add.length === 0 && p.skip.length === 1);

/* import: guests */
p = X.migPlan('guests', h, X.csvObjects('last_name,first_name,birthday,id_no,nationality\nSmith,John,1985-02-02,,\nBrown,Ann,1990-01-01,P9,British\nBrown,Ann,1990-01-01,,British\nGreen,Tim,1990-1-1,,\n,NoLast,,,\nLee,Sam,,P1,').list);
T('guests: duplicates by name+birthday or by ID number skipped, bad date and empty name rejected',
  p.add.length === 1 && p.skip.length === 3 && p.err.length === 2, JSON.stringify({ a: p.add.length, s: p.skip, e: p.err }));
X.migApply('guests', h, p);
const ng = h.guests.find(x => x.last === 'Brown');
T('guests: new profile gets the next profile number and an ID document', ng && ng.profileId === 5 && h.set.nextProfile === 6 && ng.doc.no === 'P9' && ng.nationality === 'British');

/* import: companies */
p = X.migPlan('companies', h, X.csvObjects('code,name,type\nabc,ABC Travel,a\nDIR,Direct again,C\nxyz,,C').list);
X.migApply('companies', h, p);
T('companies: code upper-cased, agent type kept, existing code skipped, missing name rejected',
  p.add.length === 1 && p.skip.length === 1 && p.err.length === 1 && h.companies.some(c => c.code === 'ABC' && c.type === 'T'));

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
