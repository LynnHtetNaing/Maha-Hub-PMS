/* Reservation deposit text in the folio: Every line of a reservation deposit reads "Reservation Deposit - (payment method)": Folio 1 and the two on Folio 4.
     node tests/sync/deposit-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('function postPayment(h,B,code,amt,o={}){'), b = src.indexOf('const bal=B=>r2(sum(B.lines,l=>l.amt));');
if (a < 0 || b < 0) throw new Error('code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
let n = 0;
const TCODES = [{ code: '900', desc: 'Cash', type: 'p', ptab: 'CASH' }, { code: '905', desc: 'Visa Card', type: 'p', ptab: 'CARD' }, { code: '900R', desc: 'Refund - Cash', type: 'p', refund: true, ptab: 'CASH' }];
const mk = () => {
  const lines = [];
  const addLine = (h, B, o) => { const l = { id: 'l' + (++n), folio: o.folio, desc: o.desc, amt: o.amt, kind: o.kind, method: o.method, code: o.code, adv: !!o.adv, deposit: !!o.deposit, group: o.group }; lines.push(l); B.lines.push(l); return l; };
  const X = new Function('TCODES', 'uid', 'addLine', 'refreshCityItems', 'r2', 'sum', src.slice(a, b) + '\nreturn {postPayment,retitleAdvanceLines};')(TCODES, () => 'x' + (++n), addLine, undefined, v => Math.round(v * 100) / 100, (l, f) => l.reduce((s, x) => s + f(x), 0));
  return X;
};
const X = mk();
const show = B => B.lines.map(l => l.folio + '|' + l.kind + '|' + l.desc + '|' + l.amt).join(' ; ');

/* reservation deposit (taken with the reservation: deposit and advance flags) */
let B = { lines: [] };
X.postPayment({}, B, '900', 500, { deposit: true, adv: true, folio: 1 });
let f1 = B.lines.filter(l => l.folio === 1), f4 = B.lines.filter(l => l.folio === 4);
T('Folio 1 has ONE line: Reservation Deposit - Cash', f1.length === 1 && f1[0].desc === 'Reservation Deposit - Cash' && f1[0].amt === -500, show(B));
T('Folio 4 has TWO lines (the advance posting) with the SAME wording as Folio 1', f4.length === 2 && f4.some(l => l.kind === 'payoff' && l.desc === 'Reservation Deposit - Cash' && l.amt === 500) && f4.some(l => l.kind === 'payrec' && l.desc === 'Reservation Deposit - Cash' && l.amt === -500), show(B));
T('all three lines read exactly the same', new Set(B.lines.map(l => l.desc)).size === 1 && B.lines.length === 3);
T('the payment method is kept on every line (reports use it)', B.lines.every(l => l.method === 'Cash'));

/* another payment method */
B = { lines: [] }; X.postPayment({}, B, '905', 1200, { deposit: true, adv: true, folio: 1 });
T('with a card it reads Reservation Deposit - Visa Card', B.lines.find(l => l.folio === 1).desc === 'Reservation Deposit - Visa Card');

/* an advance taken once the guest is in house is NOT a reservation deposit */
B = { lines: [] }; X.postPayment({}, B, '900', 300, { adv: true, folio: 1 });
T('an advance payment in house still reads Cash - Advance Payment', B.lines.find(l => l.folio === 1).desc === 'Cash - Advance Payment' && B.lines.filter(l => l.folio === 4).length === 2, show(B));

/* a deposit with the description field already holding the old wording does not repeat it */
B = { lines: [] }; X.postPayment({}, B, '900', 100, { deposit: true, adv: true, folio: 1, desc: 'Reservation Deposit - Cash' });
T('wording is never doubled', B.lines.find(l => l.folio === 1).desc === 'Reservation Deposit - Cash');
B = { lines: [] }; X.postPayment({}, B, '900', 100, { deposit: true, adv: true, folio: 1, desc: 'Cash - Advance Payment' });
T('an old Advance Payment description is cleaned', B.lines.find(l => l.folio === 1).desc === 'Reservation Deposit - Cash');

/* a normal payment is unchanged */
B = { lines: [] }; X.postPayment({}, B, '900', 800, { folio: 1 });
T('a normal payment is a single plain line', B.lines.length === 1 && B.lines[0].desc === 'Cash' && B.lines[0].folio === 1, show(B));

/* deposits already saved with the old wording are corrected when the hotel opens */
const oldLines = [
  { kind: 'pay', folio: 1, deposit: true, adv: true, method: 'Cash', desc: 'Cash - Advance Payment', amt: -500 },
  { kind: 'payoff', folio: 4, deposit: true, adv: true, method: 'Cash', desc: 'Advance Payment - Cash', amt: 500 },
  { kind: 'payrec', folio: 4, deposit: true, adv: true, method: 'Cash', desc: 'Cash - Advance Payment', amt: -500 },
  { kind: 'pay', folio: 1, deposit: false, adv: true, method: 'Visa Card', desc: 'Visa Card - Advance Payment', amt: -100 },
];
const hotel = { reservations: [{ bookings: [{ lines: oldLines }] }] };
X.retitleAdvanceLines(hotel);
T('an old reservation deposit on Folio 1 now reads Reservation Deposit - Cash', oldLines[0].desc === 'Reservation Deposit - Cash');
T('its two Folio 4 lines now read the same', oldLines[1].desc === 'Reservation Deposit - Cash' && oldLines[2].desc === 'Reservation Deposit - Cash');
T('an in-house advance payment is left as an advance payment', oldLines[3].desc === 'Visa Card - Advance Payment');
X.retitleAdvanceLines(hotel);
T('running it again changes nothing', oldLines[0].desc === 'Reservation Deposit - Cash' && oldLines[1].desc === 'Reservation Deposit - Cash' && oldLines[3].desc === 'Visa Card - Advance Payment');

/* the names on the screens: the Billing / Folio keeps ADVANCE PAYMENT; only a reservation deposit is called Reservation Deposit */
T('the folio toolbar button is still Advance payment', /tb\('fAdv','wallet','Advance payment/.test(src));
T('the window of an in-house advance is titled Advance Payment, a reservation deposit Reservation Deposit', /modal\(adv\?\(deposit\?'Reservation Deposit':'Advance Payment'\):'Payment'/.test(src));
T('its button says Post advance payment for an advance and Post deposit for a deposit', /adv\?\(deposit\?'Post deposit':'Post advance payment'\):'Post payment'/.test(src));
T('the reservation page icon is the $ Reservation Deposit', /tb\('aDep','dollar','Reservation Deposit'/.test(src));

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);