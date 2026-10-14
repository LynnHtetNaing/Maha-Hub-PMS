/* Correct payment: the correction is posted in the same style as the payment, and the soft green line prints a Credit Note.
     node tests/sync/correctpay-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const TCODES = [{ code: '100', desc: 'Room Charge', type: 'c', vat: true, dept: 'Room' }, { code: '905', desc: 'Visa Card', type: 'p', ptab: 'CREDIT CARD' }, { code: '900', desc: 'Cash', type: 'p', ptab: 'CASH' }];
let seq = 0; const uid = () => 'u' + (++seq); const chargeVat = c => true;
/* the tax of the original receipt is read from the real receiptSpec in the app; here a simple stand-in with the same shape */
const receiptSpec = (B, line) => { const a = Math.abs(line.amt); return { key: 'pay:' + line.group, base: a, nonvat: 0 }; };
const code = cut('const r2=', '\n') + '\n' + cut('const sum=', '\n') + '\n' + cut('const isCharge=', '\n') + '\n' + cut('function paymentsIn(', 'function payCodeOf') + '\n' + cut('function addLine(', '/* Advance and deposit keep three lines') + '\n' + cut('function postPayment(', '/* Folio text for an advance') + '\n' + cut('/* ---- Post-stay:', '/* ---- end Post-stay ---- */') + '\n' + cut('/* ---- Correct payment:', '/* ---- end Correct payment ---- */') + '\n' + cut('function psPayCmp(', 'const psSorted') + '\nreturn {postPayment,cpApply,cpCheck,CP_MSG,psPayCmp,paymentsIn,addLine,r2,sum};';
const X = new Function('TCODES', 'uid', 'chargeVat', 'receiptSpec', code)(TCODES, uid, chargeVat, receiptSpec);
const ctx = { bd: '2026-10-13', shift: { id: 's1', name: 'Morning' }, user: 'Cashier' };
const mkH = () => ({ set: { nextSys: 1, nextCN: 1 }, creditNotes: [], invoices: [] });
const folioSum = (B, f) => X.r2(X.sum(B.lines.filter(l => l.folio === f), l => l.amt)), total = B => X.r2(X.sum(B.lines, l => l.amt));
const received = B => X.r2(X.sum(X.paymentsIn(B.lines), x => x.amt));

/* A. an advance / reservation deposit: white line on Folio 1, grey and red on Folio 4 */
let H = mkH(), B = { id: 'b', lines: [] };
const P = X.postPayment(H, B, '905', 2000, { ...ctx, folio: 1, deposit: true, adv: true, remark: 'Reservation deposit' });
T('the deposit is 3 lines: -2000 on Folio 1, +2000 grey and -2000 red on Folio 4', P.A.amt === -2000 && P.A.folio === 1 && P.C.amt === 2000 && P.C.folio === 4 && P.R.amt === -2000 && P.R.folio === 4 && total(B) === -2000 && received(B) === 2000);
const r = X.cpApply(H, B, P.R, ctx, 'Wrong card');
T('the correction is a white line (+2000) on Folio 1, a grey line (-2000) and a soft green line (+2000) on Folio 4', r.white.folio === 1 && r.white.amt === 2000 && r.white.kind === 'pay' && r.white.adv === true && r.lines[1].kind === 'payoff' && r.lines[1].amt === -2000 && r.lines[1].folio === 4 && r.green.kind === 'corrpay' && r.green.folio === 4 && r.green.amt === 2000);
T('all the lines carry the name Correct Payment - the same payment type', r.lines.every(l => l.desc === 'Correct Payment - Visa Card'), r.lines.map(l => l.desc).join(' | '));
T('the payment is 0 again: Folio 1 = 0, Folio 4 = 0, the whole folio = 0', folioSum(B, 1) === 0 && folioSum(B, 4) === 0 && total(B) === 0);
T('in the payment reports the payment is cancelled once (nothing counted twice)', received(B) === 0);
T('the correction lines belong to the same payment group', r.lines.every(l => l.group === P.A.group));
T('the Credit Note lists the first payment, then the correct payment, no remark', r.cn.rows.length === 2 && r.cn.rows[0].amt === -2000 && r.cn.rows[1].amt === 2000 && r.cn.rows.every(x => !x.remark) && r.cn.kind === 'correct' && r.cn.label === 'Correct payment');
T('the Credit Note takes the tax of the receipt back (shown as a reversal) and gets the next CN number', r.cn.neg === true && r.cn.total === 2000 && r.cn.vatable === 2000 && r.cn.no === 'CN000001' && r.green.cn === 'CN000001');
T('the soft green line is the one linked to the Credit Note', r.cn.lineId === r.green.id);

/* B. a normal payment: one red line on the folio, corrected by one soft green line */
H = mkH(); B = { id: 'b2', lines: [] };
X.addLine(H, B, { code: '100', amt: 3000, kind: 'room', bd: '2026-10-12' });
const N = X.postPayment(H, B, '900', 3000, { ...ctx, folio: 1 }); N.A.fixed = true;
T('a normal payment is one line and takes the folio to 0', B.lines.length === 2 && total(B) === 0 && received(B) === 3000);
const r2_ = X.cpApply(H, B, N.A, ctx, 'Wrong amount');
T('its correction is ONE soft green line (+3000) on the same folio', r2_.lines.length === 1 && r2_.green.kind === 'corrpay' && r2_.green.folio === 1 && r2_.green.amt === 3000 && r2_.white === null);
T('the payment is 0 again and the folio shows the charge to pay', received(B) === 0 && total(B) === 3000);
T('the Credit Note rows are the first payment (-3000) and the correct payment (+3000)', r2_.cn.rows[0].amt === -3000 && r2_.cn.rows[1].amt === 3000 && r2_.cn.no === 'CN000001');

/* C. the credit notes of a hotel are numbered one after the other */
const r3 = X.cpApply(H, B, X.postPayment(H, B, '900', 100, { ...ctx, folio: 1 }).A, ctx, 'x');
T('the next Credit Note gets the next number', r3.cn.no === 'CN000002' && H.set.nextCN === 3);

/* E. who may correct a payment */
const today = '2026-10-13', shiftMN = { id: 'sMN', name: 'Morning', status: 'open' }, shiftAF = { id: 'sAF', name: 'Afternoon', status: 'open' };
const env = (o) => Object.assign({ bd: today, isLocked: d => d < today, resDate: '2026-10-01', shift: shiftMN, shifts: [shiftMN, shiftAF] }, o);
const pay = (o) => Object.assign({ kind: 'pay', bd: today, shiftId: 'sMN', shiftName: 'Morning', group: 'g', amt: -1000 }, o);
const bk = (o) => Object.assign({ lines: [], checkinDate: today }, o);
T('a payment taken today in your own shift can be corrected', X.cpCheck(bk(), pay(), env()) === '');
T('another shift: the box says to sign in again to the same shift (cash drop would not balance)', /Morning shift/.test(X.cpCheck(bk(), pay(), env({ shift: shiftAF }))) && /sign in again to the same Morning shift/.test(X.cpCheck(bk(), pay(), env({ shift: shiftAF }))) && /cash drop/.test(X.cpCheck(bk(), pay(), env({ shift: shiftAF }))));
T('the shift that took it is closed: use Refund', X.cpCheck(bk(), pay(), env({ shift: shiftAF, shifts: [{ ...shiftMN, status: 'closed' }, shiftAF] })) === X.CP_MSG.closed);
T('a payment of an earlier day (after Close Day) cannot be corrected: Refund', X.cpCheck(bk(), pay({ bd: '2026-10-12' }), env()) === X.CP_MSG.day);
T('a no-shift sign-in cannot correct a payment', X.cpCheck(bk(), pay(), env({ shift: { id: 'ns', noShift: true } })) === X.CP_MSG.noshift);
T('a refund line cannot be corrected', X.cpCheck(bk(), pay({ refund: true }), env()) === 'This line cannot be corrected.');
const dep = (o) => pay(Object.assign({ deposit: true, adv: true }, o));
T('a deposit posted today, reservation made today and checked in today: Correct payment is allowed', X.cpCheck(bk(), dep(), env({ resDate: today })) === '');
T('a deposit of a reservation made on an earlier day: Refund only', X.cpCheck(bk(), dep(), env({ resDate: '2026-10-10' })) === X.CP_MSG.dep);
T('a deposit of a reservation not checked in: Refund only', X.cpCheck(bk({ checkinDate: undefined }), dep(), env({ resDate: today })) === X.CP_MSG.dep);
T('a deposit of an earlier day: nothing can be done but Refund', X.cpCheck(bk(), dep({ bd: '2026-10-12' }), env({ resDate: today })) === X.CP_MSG.day);
T('the red line of a deposit (payrec) follows the same deposit rule through its group', X.cpCheck({ lines: [dep({ kind: 'pay', group: 'gx' }), pay({ kind: 'payrec', group: 'gx', deposit: true })], checkinDate: undefined }, pay({ kind: 'payrec', group: 'gx', deposit: true }), env({ resDate: today })) === X.CP_MSG.dep);

/* F. in the reports a correct payment is a separate line right under its own payment */
const L = (id, group, kind, time, room) => ({ id, group, kind, time, room });
const items = [L('a', 'g1', 'payrec', 100, '204'), L('b', 'g2', 'payrec', 200, '204'), L('c', 'g1', 'corrpay', 300, '204'), L('d', 'g3', 'payrec', 150, '305')];
const sorted = items.slice().sort(X.psPayCmp(items, x => x)).map(x => x.id).join('');
T('payment a, then its correct payment c right under it, then the others in time order', sorted === 'acdb', sorted);

/* D. the screens */
T('there is no separate Void payment button any more (Correct payment does the same work)', !/id="tVoid" \$\{!can\('corrpay'\)/.test(src));
T('clicking the soft green line prints the Credit Note (bill-to and copies are chosen first)', /cn=sel&&sel\.cn\?/.test(src) && /printCreditNote\(B,cn,\{bill:o\.bill,other:o\.other,copies:o\.copies\}\)/.test(src));
T('the credit note document has no remark line (rows are built without remark or card)', !/rows:cn\.rows\.map\(x=>\(\{bd:cn\.bd,desc:x\.desc,ref:x\.ref\|\|'',amt:x\.amt,remark/.test(src));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
