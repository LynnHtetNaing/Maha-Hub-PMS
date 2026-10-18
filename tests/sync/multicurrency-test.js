/* Multi-currency helpers: which currencies a hotel may use, the currency of a reservation, and how a payment in another currency settles a folio.
     node tests/sync/multicurrency-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Multi-currency:'), b = src.indexOf('/* ---- end Multi-currency ---- */');
if (a < 0 || b < 0) throw new Error('code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function('H', 'user', 'can', src.slice(a, b) + '\nreturn {CUR_LIST,curName,curMain,curOthers,curMulti,curList,curUserOn,bCur,bForeign,bRate,curInfo,curToMain,curApply,curLineCur,curLineAmt,curLineEq,curPanelCalc};');

const hotel = (extra) => ({ code: 'PAD01', set: Object.assign({ cur: 'THB', curWord: 'BAHT', subWord: 'SATANG', bfAdult: 150 }, extra || {}) });
let H = hotel(), U = { name: 'staff', perms: [] };
const mk = () => X(H, () => U, p => !!U.provider || (U.perms || []).includes(p));

/* a hotel that never opened another currency behaves exactly as before */
let m = mk();
T('a hotel with no extra currency is single-currency', !m.curMulti(H) && m.curOthers(H).length === 0 && m.curList(H).join() === 'THB');
T('nobody can choose a currency there, not even the provider', !m.curUserOn());
T('a reservation without a currency field is in the main currency, rate 1', m.bCur({}) === 'THB' && m.bRate({}) === 1 && !m.bForeign({}));
T('an old reservation of a hotel with extra currencies is still in the main currency', (() => { H = hotel({ curAllow: ['USD'] }); const k = mk(); const r = k.bCur({ id: 'old' }) === 'THB' && k.bRate({ id: 'old' }) === 1; H = hotel(); return r })());

/* extra currencies */
H = hotel({ curAllow: ['USD', 'EUR', 'THB', 'USD', '', null] }); m = mk();
T('the list never repeats a currency and never repeats the main one', m.curOthers(H).join() === 'USD,EUR' && m.curList(H).join() === 'THB,USD,EUR' && m.curMulti(H));
T('a broken list is harmless', (() => { const h2 = hotel({ curAllow: 'USD' }); return m.curOthers(h2).length === 0 && !m.curMulti(h2) })());

/* who may choose */
U = { name: 'front', perms: ['res.create'] }; m = mk();
T('staff cannot choose until the provider allows users AND gives the permission', !m.curUserOn());
H = hotel({ curAllow: ['USD'], curUsers: true }); m = mk();
T('allowed by the provider but no permission: still no', !m.curUserOn());
U = { name: 'mgr', perms: ['currency'] }; m = mk();
T('allowed and permitted: yes', m.curUserOn());
H = hotel({ curAllow: ['USD'], curUsers: false }); m = mk();
T('permission without the provider switch: no', !m.curUserOn());
U = { name: 'prov', isProv: true, perms: [] }; m = mk();
T('the provider inside a hotel can always choose when the hotel has extra currencies', m.curUserOn());
H = hotel(); m = mk();
T('but not when the hotel has none', !m.curUserOn());
U = { name: 'staff', perms: [] };

/* reservation currency */
H = hotel({ curAllow: ['USD'] }); m = mk();
const B = { cur: 'USD', curRate: 35.5 };
T('a reservation in USD', m.bCur(B) === 'USD' && m.bForeign(B) && m.bRate(B) === 35.5);
T('a reservation in the main currency has rate 1 even if a rate was typed', m.bRate({ cur: 'THB', curRate: 9 }) === 1 && !m.bForeign({ cur: 'THB' }));
T('a foreign reservation with no usable rate falls back to 1 (never divides by zero)', m.bRate({ cur: 'USD', curRate: 0 }) === 1 && m.bRate({ cur: 'USD' }) === 1);

/* words and breakfast per currency */
H = hotel({ curAllow: ['USD', 'CNY'], curInfo: { USD: { word: 'DOLLARS', sub: 'CENTS', bfA: 5, bfC: 2.5 } } }); m = mk();
T('the main currency keeps its own words', m.curInfo(H, 'THB').word === 'BAHT' && m.curInfo(H, 'THB').sub === 'SATANG' && m.curInfo(H, 'THB').bfA === 150);
T('a currency set by the provider uses those words and breakfast values', m.curInfo(H, 'USD').word === 'DOLLARS' && m.curInfo(H, 'USD').bfA === 5 && m.curInfo(H, 'USD').bfC === 2.5);
T('a currency the provider did not edit uses the standard words', m.curInfo(H, 'CNY').word === 'YUAN' && m.curInfo(H, 'CNY').sub === 'FEN' && m.curInfo(H, 'CNY').bfA === 0);
T('the currency list has no repeats and every entry has words', new Set(m.CUR_LIST.map(c => c[0])).size === m.CUR_LIST.length && m.CUR_LIST.every(c => /^[A-Z]{3}$/.test(c[0]) && c[1] && c[2] === c[2].toUpperCase() && c[3] === c[3].toUpperCase()) && m.CUR_LIST.length >= 40);

/* conversion: 1 unit of the selected currency = X main currency */
T('equivalent in the main currency', m.curToMain(50, 35.5) === 1775 && m.curToMain(50, 0) === 50 && m.curToMain(10, 1.005) === 10.05);
/* folio in THB (main). Guest pays USD 50 at 35.50 */
let r = m.curApply(50, 'USD', 35.5, 'THB', 1, 'THB');
T('USD 50 at 35.50 on a THB folio settles THB 1,775.00', r.main === 1775 && r.folio === 1775 && !r.same, JSON.stringify(r));
r = m.curApply(2000, 'THB', 0, 'THB', 1, 'THB');
T('THB on a THB folio: no conversion', r.same && r.folio === 2000 && r.main === 2000);
/* folio in USD (reservation made at 35.50). Guest pays THB 7,200 on a day when 1 USD = 36 */
r = m.curApply(7200, 'THB', 0, 'USD', 36, 'THB');
T('THB 7,200 at 1 USD = 36.00 settles exactly USD 200.00 (the old creation rate is not used)', r.folio === 200 && r.main === 7200, JSON.stringify(r));
/* paid in the reservation currency itself */
r = m.curApply(200, 'USD', 0, 'USD', 35.5, 'THB');
T('USD 200 on a USD folio: no conversion, the report equivalent uses the reservation rate when the rate box is left as it is', r.same && r.folio === 200 && r.main === 7100, JSON.stringify(r));
r = m.curApply(200, 'USD', 36, 'USD', 35.5, 'THB');
T('the cashier may type that day\'s rate: only the equivalent changes, the folio stays USD 200', r.same && r.folio === 200 && r.main === 7200, JSON.stringify(r));
/* neither currency is the main one */
r = m.curApply(100, 'EUR', 38.2, 'USD', 36, 'THB');
T('EUR 100 at 38.20 on a USD folio at 36.00 settles USD 106.11', r.main === 3820 && r.folio === 106.11, JSON.stringify(r));
r = m.curApply(100, 'EUR', 0, 'USD', 36, 'THB');
T('a different currency needs its rate', !!r.error && r.folio === 0, JSON.stringify(r));
r = m.curApply(100, 'THB', 0, 'USD', 0, 'THB');
T('a foreign folio needs the rate of that day for a payment in the main currency', !!r.error);
T('rounding is to 2 decimals and never produces NaN', (() => { const q = m.curApply('abc', 'USD', 35.5, 'THB', 1, 'THB'); return q.main === 0 && q.folio === 0 && !Number.isNaN(q.main) })());

/* the Post / Payment block: what a line stores and what it does to the folio */
H = hotel({ curAllow: ['USD', 'EUR'] }); m = mk();
const thbRes = { id: 'b1' };                      /* a reservation in the main currency */
const usdRes = { id: 'b2', cur: 'USD', curRate: 35.5 };
let c = m.curPanelCalc(thbRes, { cur: 'THB' }, 2000);
T('main reservation paid in main currency: nothing stored, nothing changes', !c.fx && c.folio === 2000 && !c.error, JSON.stringify(c));
c = m.curPanelCalc(thbRes, { cur: 'USD', rp: '35.5' }, 50);
T('main reservation paid USD 50 at 35.50: the folio goes down by THB 1,775.00 and the line remembers USD 50 at 35.5', c.folio === 1775 && c.fx.fc === 'USD' && c.fx.fa === 50 && c.fx.fr === 35.5 && c.fx.eq === 1775, JSON.stringify(c));
c = m.curPanelCalc(thbRes, { cur: 'USD', rp: '' }, 50);
T('a foreign payment with no rate is refused', !!c.error && !c.fx, JSON.stringify(c));
c = m.curPanelCalc(usdRes, { cur: 'USD' }, 200);
T('USD reservation paid in USD: folio USD 200, equivalent at the reservation rate', c.folio === 200 && c.main === 7100 && c.fx && c.fx.eq === 7100, JSON.stringify(c));
c = m.curPanelCalc(usdRes, { cur: 'USD', rp: '36' }, 200);
T('the cashier types that day\'s rate: only the equivalent changes', c.folio === 200 && c.main === 7200, JSON.stringify(c));
c = m.curPanelCalc(usdRes, { cur: 'THB', rr: '36' }, 7200);
T('USD reservation paid THB 7,200 when 1 USD = 36: exactly USD 200 off the folio', c.folio === 200 && c.main === 7200 && c.fx.fc === 'THB' && c.fx.fr === 1, JSON.stringify(c));
c = m.curPanelCalc(usdRes, { cur: 'THB', rr: '' }, 7200);
T('a payment in the main currency on a foreign folio needs the rate of the day', !!c.error, JSON.stringify(c));
c = m.curPanelCalc(usdRes, { cur: 'EUR', rp: '38.2', rr: '36' }, 100);
T('EUR on a USD folio needs both rates', c.folio === 106.11 && c.main === 3820, JSON.stringify(c));
T('an empty amount gives nothing and no error', (() => { const q = m.curPanelCalc(usdRes, { cur: 'THB', rr: '36' }, 0); return !q.error && q.folio === 0 && !q.fx })());

/* what a line says about itself */
T('a line without a record of its own is in the reservation currency', m.curLineCur(usdRes, { amt: 100 }) === 'USD' && m.curLineAmt(usdRes, { amt: 100 }) === 100 && m.curLineEq(usdRes, { amt: 100 }) === 3550 && m.curLineEq(thbRes, { amt: 100 }) === 100);
T('a line with its own record reports that currency, amount and equivalent', (() => { const l = { amt: -1775, fc: 'USD', fa: -50, fr: 35.5, eq: -1775 }; return m.curLineCur(thbRes, l) === 'USD' && m.curLineAmt(thbRes, l) === -50 && m.curLineEq(thbRes, l) === -1775 })());
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
