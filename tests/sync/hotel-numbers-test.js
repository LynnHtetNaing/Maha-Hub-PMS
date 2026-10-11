/* Hotel numbers: the Confirmation No. (hotel code + reservation number) and the automatic Reference for Direct / Walk-In.
     node tests/sync/hotel-numbers-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Hotel numbers:'), b = src.indexOf('/* ---- end Hotel numbers ---- */');
if (a < 0 || b < 0) throw new Error('code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {confNo,refLetters,refNo,refIsAuto,takeRef,stampHotelNumbers};')();

/* Confirmation No. */
T('Confirmation No. is the hotel code and the reservation number', X.confNo('PAD01', 1002) === 'PAD01-1002');
T('it grows by itself past 9999', X.confNo('PAD01', 9999) === 'PAD01-9999' && X.confNo('PAD01', 10000) === 'PAD01-10000' && X.confNo('PAD01', 1234567) === 'PAD01-1234567');
T('two hotels never share a Confirmation No. for the same reservation number', X.confNo('PAD01', 1002) !== X.confNo('MHY01', 1002));

/* Reference letters and digits */
T('the three letters come from the hotel code', X.refLetters('PAD01') === 'PAD' && X.refLetters('mhy01') === 'MHY' && X.refLetters('BKK02') === 'BKK');
T('a code with few letters is completed so there are always three', X.refLetters('H1B02') === 'HBX' && X.refLetters('12345') === 'XXX' && X.refLetters('AB') === 'ABX' && X.refLetters('') === 'XXX' && X.refLetters(null) === 'XXX');
T('the Reference is three letters and at least six digits', X.refNo('PAD01', 1) === 'PAD000001' && X.refNo('PAD01', 245) === 'PAD000245' && /^[A-Z]{3}\d{6,}$/.test(X.refNo('PAD01', 31)));
T('it never runs out: after 999999 it simply gets one more digit', X.refNo('PAD01', 999999) === 'PAD999999' && X.refNo('PAD01', 1000000) === 'PAD1000000' && X.refNo('PAD01', 12345678) === 'PAD12345678');
T('a broken counter still gives a valid number', X.refNo('PAD01', 0) === 'PAD000001' && X.refNo('PAD01', undefined) === 'PAD000001' && X.refNo('PAD01', NaN) === 'PAD000001' && X.refNo('PAD01', 7.9) === 'PAD000007');

/* which bookings get an automatic Reference */
T('Direct and Walk-In are automatic', X.refIsAuto({ code: 'DIR' }) && X.refIsAuto({ code: 'WIN' }));
T('an OTA, a travel agent or a company keeps the free box', !X.refIsAuto({ code: 'AGD' }) && !X.refIsAuto({ code: 'BKG' }) && !X.refIsAuto({ code: 'SLC' }) && !X.refIsAuto(null) && !X.refIsAuto(undefined));

/* stamping a new reservation */
const hotel = () => ({ code: 'PAD01', set: { nextRef: 245 }, companies: [{ id: 'c6', code: 'DIR' }, { id: 'c7', code: 'WIN' }, { id: 'c1', code: 'AGD' }] });
let h = hotel(), r = { no: 1002, companyId: 'c6', reference: 'typed by mistake' };
X.stampHotelNumbers(h, r);
T('a Direct booking gets the Confirmation No. and the next automatic Reference', r.confirmation === 'PAD01-1002' && r.reference === 'PAD000245' && r.refAuto === true && h.set.nextRef === 246, JSON.stringify(r));
r = { no: 1003, companyId: 'c7', reference: '' }; X.stampHotelNumbers(h, r);
T('a Walk-In gets the next one after that', r.reference === 'PAD000246' && r.refAuto === true && h.set.nextRef === 247);
r = { no: 1004, companyId: 'c1', reference: '2294515000' }; X.stampHotelNumbers(h, r);
T('an OTA booking gets the Confirmation No. but keeps the OTA reference, and uses no automatic number', r.confirmation === 'PAD01-1004' && r.reference === '2294515000' && r.refAuto === false && h.set.nextRef === 247, JSON.stringify(r));
r = { no: 1005, companyId: 'c1', reference: '' }; X.stampHotelNumbers(h, r);
T('an OTA booking with no reference yet stays empty (free box)', r.reference === '' && r.refAuto === false);
r = { no: 1006, companyId: '', reference: '' }; X.stampHotelNumbers(h, r);
T('no company at all is a free box too', r.confirmation === 'PAD01-1006' && r.reference === '' && r.refAuto === false);
r = { no: 1007, companyId: 'c6', reference: 'GROUP' }; const before = h.set.nextRef; X.stampHotelNumbers(h, r, { keepRef: true });
T('the group master keeps its own reference and uses no automatic number', r.confirmation === 'PAD01-1007' && r.reference === 'GROUP' && h.set.nextRef === before);

/* a hotel that never had the counter starts at 1; numbers are never repeated */
h = hotel(); delete h.set.nextRef; r = { no: 1, companyId: 'c6' }; X.stampHotelNumbers(h, r);
T('a hotel without the counter starts at 000001', r.reference === 'PAD000001' && h.set.nextRef === 2);
h = hotel(); const seen = new Set(); let dup = false;
for (let i = 0; i < 500; i++) { const x = { no: 2000 + i, companyId: i % 2 ? 'c6' : 'c7' }; X.stampHotelNumbers(h, x); if (seen.has(x.reference)) dup = true; seen.add(x.reference); }
T('500 bookings in a row: no automatic Reference is ever repeated', !dup && seen.size === 500);
h = hotel(); h.set.nextRef = 999999; const l = { no: 1, companyId: 'c6' }, m = { no: 2, companyId: 'c6' }; X.stampHotelNumbers(h, l); X.stampHotelNumbers(h, m);
T('crossing 999999 works: PAD999999 then PAD1000000', l.reference === 'PAD999999' && m.reference === 'PAD1000000');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
