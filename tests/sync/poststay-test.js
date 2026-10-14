/* Refund, rebate and adjust (+) after check-out.
     node tests/sync/poststay-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const TCODES = [
  { code: '100', desc: 'Room Charge', type: 'c', vat: true, dept: 'Room' },
  { code: '210', desc: 'Restaurant', type: 'c', vat: true, dept: 'F&B' },
  { code: '128', desc: 'Adjust - Room Charge (+)', type: 'c', vat: true, dept: 'Room' },
  { code: '900', desc: 'Cash', type: 'p', ptab: 'CASH' }, { code: '904', desc: 'Refund - Cash', type: 'p', ptab: 'CASH', refund: true, refFor: '900' },
  { code: '850', desc: 'Bank Transfer', type: 'p', ptab: 'BANK / QR' }, { code: '850R', desc: 'Refund - Bank Transfer', type: 'p', ptab: 'BANK / QR', refund: true, refFor: '850' }];
let seq = 0; const uid = () => 'u' + (++seq); const chargeVat = (c) => { const t = TCODES.find(x => x.code === (c.code || c)) || {}; return !!t.vat; };
const code = cut('const r2=', '\n') + '\n' + cut('const sum=', '\n') + '\n' + cut('const isCharge=', '\n') + '\n' + cut('function paymentsIn(', 'function payCodeOf') + '\n' + cut('function addLine(', '/* Advance and deposit keep three lines') + '\n' + cut('/* ---- Post-stay:', '/* ---- end Post-stay ---- */') + '\nreturn {PS_MSG,psPaid,psPools,psCredit,psCheck,psAmountError,psRefund,psRebate,psAdjust,psIssue,psCNo,addLine,paymentsIn,r2,sum};';
const X = new Function('TCODES', 'uid', 'chargeVat', code)(TCODES, uid, chargeVat);
const h = () => ({ set: { nextSys: 1, nextCN: 1 }, creditNotes: [] });
const ctx = { bd: '2026-10-13', shift: { id: 's1', name: 'Morning' }, user: 'Mgr' };
const bal = B => X.r2(X.sum(B.lines, l => l.amt));
/* a checked-out booking: 3 nights at 1500 (VAT) and 4500 paid in cash, as in the example */
function stay(H) {
  const B = { id: 'b1', lines: [] };
  for (let i = 0; i < 3; i++) X.addLine(H, B, { code: '100', amt: 1500, kind: 'room', bd: '2026-10-1' + i, night: '2026-10-1' + i });
  X.addLine(H, B, { code: '900', amt: -4500, kind: 'pay', method: 'Cash', group: 'g1', bd: '2026-10-12' }); return B;
}

T('the message for staff without the permission is exact', X.PS_MSG.perm === 'You are not eligible to do this function');
let H = h(), B = stay(H);
T('no permission: every one of the three is blocked with that message', ['refund', 'rebate', 'adjust'].every(k => X.psCheck(B, k, false) === X.PS_MSG.perm));
T('a paid booking can be refunded and rebated', X.psCheck(B, 'refund', true) === '' && X.psCheck(B, 'rebate', true) === '');
T('nothing to adjust while the folio has no overpayment', X.psCheck(B, 'adjust', true) === X.PS_MSG.adjust && bal(B) === 0);

/* nothing to do -> not allowed */
const empty = { id: 'b0', lines: [] };
T('a booking with no payment cannot be refunded', X.psCheck(empty, 'refund', true) === X.PS_MSG.refund);
T('a booking with no charge cannot be rebated', X.psCheck(empty, 'rebate', true) === X.PS_MSG.rebate);
T('a booking with no overpayment cannot be adjusted', X.psCheck(empty, 'adjust', true) === X.PS_MSG.adjust);

/* rebate "for the total nights" as ONE post */
let pools = X.psPools(B);
T('the three room nights are one pool of 4500 (one post for the total nights)', pools.length === 1 && pools[0].code === '100' && pools[0].amt === 4500 && pools[0].n === 3);
T('a rebate cannot be more than the charge', X.psAmountError(pools[0].amt, 4600) !== '' && X.psAmountError(pools[0].amt, 4500) === '' && X.psAmountError(4500, 0) !== '');
const rb = X.psRebate(H, B, pools[0], 1200, { ...ctx, remark: 'Guest complained' });
T('the rebate is one negative post on the same revenue code, VAT kept, flagged', rb.amt === -1200 && rb.code === '100' && rb.vat === true && rb.rebate === true && rb.kind === 'post' && rb.bd === '2026-10-13');
T('a partial rebate leaves the rest of the charge to rebate', X.psPools(B)[0].amt === 3300);

/* refund by a different method than the guest paid with */
T('4500 was received in cash', X.psPaid(B) === 4500);
const rf = X.psRefund(H, B, { ...ctx, code: '850R', amt: 1200, ref: 'TRF-77', remark: 'Guest complained' });
T('the refund is a payment line of +1200 under the NORMAL type (Bank Transfer), flagged as refund', rf.amt === 1200 && rf.kind === 'pay' && rf.method === 'Bank Transfer' && rf.desc === 'Refund - Bank Transfer' && rf.refund === true);
T('after the refund the folio is back to 0 (rebate -1200, refund +1200)', bal(B) === 0);
const pays = X.paymentsIn(B.lines), byMethod = {}; pays.forEach(p => byMethod[p.l.method] = (byMethod[p.l.method] || 0) + p.amt);
T('in the payment report the refund is a deduction under Bank Transfer and Cash keeps its 4500', byMethod['Bank Transfer'] === -1200 && byMethod['Cash'] === 4500, JSON.stringify(byMethod));
T('refund cannot be more than what was paid', X.psAmountError(X.psPaid(B), 3301) !== '' && X.psPaid(B) === 3300);

/* credit notes */
const cn1 = X.psIssue(H, B, 'rebate', rb, 'Guest complained', ctx), cn2 = X.psIssue(H, B, 'refund', rf, 'Guest complained', ctx);
T('credit notes are numbered one after the other and never repeat', cn1.no === 'CN000001' && cn2.no === 'CN000002' && H.set.nextCN === 3 && new Set(H.creditNotes.map(c => c.no)).size === 2);
T('a rebate credit note carries the VAT-able amount; a refund one is not taxed', cn1.vatable === 1200 && cn1.nonvat === 0 && cn2.vatable === 0 && cn2.nonvat === 1200 && cn1.total === 1200);
T('the credit note is linked on the line', rb.cn === 'CN000001' && rf.cn === 'CN000002');

/* rebate everything, then nothing is left to rebate */
X.psRebate(H, B, X.psPools(B)[0], 3300, ctx);
T('when everything is rebated there is nothing more to rebate', X.psCheck(B, 'rebate', true) === X.PS_MSG.rebate && X.psPools(B).length === 0);

/* adjust (+) keeps an overpayment as revenue */
const H2 = h(), B2 = { id: 'b2', lines: [] };
X.addLine(H2, B2, { code: '100', amt: 3000, kind: 'room', bd: '2026-10-11' }); X.addLine(H2, B2, { code: '900', amt: -3500, kind: 'pay', method: 'Cash', group: 'g9' });
T('an overpayment of 500 shows as a credit balance', X.psCredit(B2) === 500 && X.psCheck(B2, 'adjust', true) === '');
T('adjust cannot be more than the overpayment', X.psAmountError(X.psCredit(B2), 600) !== '');
const ad = X.psAdjust(H2, B2, '128', 500, { ...ctx, remark: 'Keep' });
T('adjust (+) posts +500 to the adjust code, flagged, and the folio comes to 0', ad.amt === 500 && ad.code === '128' && ad.adjust === true && bal(B2) === 0 && X.psCheck(B2, 'adjust', true) === X.PS_MSG.adjust);

/* wiring in the app */
T('the three permissions exist', /\['refund','Refund money/.test(src) && /\['rebate','Rebate \(reduce\)/.test(src) && /\['adjust','Adjust \(\+\)/.test(src));
T('a click without the permission opens the "not eligible" box, for everybody who can see the button', /function psEntry\(B,kind,after,presetKey\)\{if\(!can\(kind\)\)\{dlgAlert\(PS_MSG\.perm\)/.test(src));
T('the folio toolbar has no Refund / Rebate / Adjust icons of its own', !/psButtons|psBtn\(/.test(src) && !/id="fCN"/.test(src));
T('Rebate and Adjust (+) are tiles of the Post window with their own icons, like every other code', /ic\(isRb\(c\)\?'rebate':isAd\(c\)\?'swap':'copy',40\)/.test(src) && !/data-psb="rebate"/.test(src) && !/psOpenPost/.test(src));
T('after check-out the Post window shows only the Rebate and Adjust codes, and choosing one opens the correction window', /const gone=B\.status==='out'/.test(src) && /\(!gone\|\|c\.rebFor\|\|c\.adjFor\)/.test(src) && /psEntry\(B,isRb\(c\)\?'rebate':'adjust',after/.test(src));
T('Refund types are tiles of the Payment window (refund icon), and choosing one opens the refund window', /const list=inTab;/.test(src) && /if\(c0&&c0\.refund\)\{if\(!can\('refund'\)\)\{dlgAlert\(PS_MSG\.perm\);return\}closeModal\(m\);psEntry\(B,'refund',after,c0\.code\)/.test(src) && !/data-psb="refund"/.test(src));
T('staff without the permission get the not-eligible message when they choose a Rebate or Adjust code', /isRb\(c\)&&!can\('rebate'\)\|\|isAd\(c\)&&!can\('adjust'\)\)\{dlgAlert\(PS_MSG\.perm\)/.test(src));
T('the old Refund types switch is gone from the Payment window', !/id="pyRefT"/.test(src));
T('the Print icon makes the Credit Note of any line that has one', /cn=sel&&sel\.cn\?/.test(src));
T('the credit note is a money document titled CREDIT NOTE, printed original and copy', /spec\.credit\?'CREDIT NOTE'/.test(src) && /copies:o\.copies\|\|'both'/.test(cut('function printCreditNote', 'function psAfterPost')));
T('the number block for credit notes is leased like the others', /'nextRef','nextCN'\]/.test(src));
T('the Post window refuses a rebate code when there is nothing to rebate', /if\(base\.rebate\)\{const net=/.test(src));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
