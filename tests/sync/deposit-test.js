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
T('Folio 4 gets nothing: a reservation deposit is only one line', f4.length === 0 && B.lines.length === 1, show(B));
T('the payment method is kept on the line (reports use it)', B.lines.every(l => l.method === 'Cash'));
/* another payment method */
B = { lines: [] }; X.postPayment({}, B, '905', 1200, { deposit: true, adv: true, folio: 1 });
T('with a card it reads Reservation Deposit - Visa Card', B.lines.length === 1 && B.lines[0].desc === 'Reservation Deposit - Visa Card');

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
  { kind: 'pay', folio: 1, deposit: true, group: 'g1', adv: true, method: 'Cash', desc: 'Cash - Advance Payment', amt: -500 },
  { kind: 'payoff', folio: 4, deposit: true, group: 'g1', adv: true, method: 'Cash', desc: 'Advance Payment - Cash', amt: 500 },
  { kind: 'payrec', folio: 4, deposit: true, group: 'g1', adv: true, method: 'Cash', desc: 'Cash - Advance Payment', amt: -500 },
  { kind: 'pay', folio: 1, deposit: false, adv: true, method: 'Visa Card', desc: 'Visa Card - Advance Payment', amt: -100 },
];
const hotel = { reservations: [{ bookings: [{ lines: oldLines }] }] };
X.retitleAdvanceLines(hotel);
const kept = hotel.reservations[0].bookings[0].lines;
T('an old three-line reservation deposit becomes ONE line: Reservation Deposit - Cash', kept.filter(l => l.deposit).length === 1 && kept.find(l => l.deposit).desc === 'Reservation Deposit - Cash' && kept.find(l => l.deposit).folio === 1 && kept.find(l => l.deposit).kind === 'pay');
T('an in-house advance payment is left as an advance payment', kept.some(l => l.desc === 'Visa Card - Advance Payment'));
X.retitleAdvanceLines(hotel);
T('running it again changes nothing', hotel.reservations[0].bookings[0].lines.length === 2);
const mixed = [
  { kind: 'pay', folio: 1, deposit: true, adv: true, method: 'Cash', group: 'x', desc: 'a', amt: -500 }, { kind: 'payoff', folio: 4, deposit: true, adv: true, method: 'Cash', group: 'x', desc: 'a', amt: 500 }, { kind: 'payrec', folio: 4, deposit: true, adv: true, method: 'Cash', group: 'x', desc: 'a', amt: -500 },
  { kind: 'corrpay', folio: 4, deposit: true, method: 'Cash', group: 'x', desc: 'c', amt: 500, corr: true }];
const h2 = { reservations: [{ bookings: [{ lines: mixed }] }] }; X.retitleAdvanceLines(h2);
T('a deposit that was already corrected keeps all its lines (nothing is lost)', h2.reservations[0].bookings[0].lines.length === 4);
/* the names on the screens: the Billing / Folio keeps ADVANCE PAYMENT; only a reservation deposit is called Reservation Deposit */
T('the folio toolbar button is still Advance payment', /tb\('fAdv','wallet','Advance payment/.test(src));
T('the window of an in-house advance is titled Advance Payment, a reservation deposit Reservation Deposit', /modal\(adv\?\(deposit\?'Reservation Deposit':'Advance Payment'\):\(noBill0\?'Refund':'Payment'\)/.test(src));
T('its button says Post advance payment for an advance and Post deposit for a deposit', /adv\?\(deposit\?'Post deposit':'Post advance payment'\):'Post payment'/.test(src));
T('the reservation page icon is the $ Reservation Deposit', /tb\('aDep','dollar',resDeps\(B\)\.length\?'Reservation deposits \(see, add, correct, refund\)':'Reservation Deposit'/.test(src));

T('the deposit invoice line reads Reservation Deposit - (payment type)', /rows:\[\{bd,desc:'Reservation Deposit - '\+method,ref,amt,card,remark\}\]/.test(src));
T('the deposit invoice is the same as any other invoice: no "Reservation Deposit TAX INVOICE" heading and the normal Room Number / Folio No. boxes', !/Reservation Deposit TAX INVOICE/.test(src) && !/const (left|right)=spec\.deposit\?/.test(src) && /<b>TAX INVOICE NO\. \$\{invRef\(spec\.inv\)\} \(\$\{label\}\)<\/b>/.test(src));
T('the system writes no "ROOM RENTAL" line on an invoice', !/ROOM RENTAL/.test(src) && !/note:'ROOM/.test(src));
T('a deposit taken with a new reservation carries no automatic remark', /ref:q\('#nPref'\)\.value\.trim\(\),remark:''\}/.test(src));
T('a remark typed by a person is shown in the same italic style as the old automatic line, without a star', /<tr class="ivrm"><td colspan="4">\$\{esc\(c\.x\.remark\)\}<\/td><\/tr>/.test(src) && /\.inv \.ivrm td\{font-style:italic/.test(src));
T('the $ Deposit button of the reservation is shown only before arrival (in house it would post an Advance Payment)', /\$\{\(\['confirmed','tentative'\]\.includes\(B\.status\)\|\|resDeps\(B\)\.length\)\?tb\('aDep'//.test(src) && /if\(q\('#aDep'\)\)q\('#aDep'\)\.onclick/.test(src));T('a deposit has no invoice of its own on the folio: the Deposit invoice button of the reservation prints it', /if\(depSelected\(B\)\)\{dlgAlert\(DEP_PRINT_MSG\);return\}/.test(src) && /id=\"aDinv\"/.test(src));
T('saving a reservation with a deposit does not open an invoice by itself', !/if\(depN>0&&can\('print'\)\)printDeposit\(B\)/.test(src));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);