/* Every charge code has its own Rebate and Adjust (+), every payment type its Refund; they follow open / hide.
     node tests/sync/relatives-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const code = cut('const TCODES=[', 'const PAY_TABS=') + cut('const PAY_TABS=', '\n') + '\nreturn {TCODES,addChargeRelatives,chBase};';
let X;
try { X = new Function(code)(); } catch (e) { console.log('cannot load the code table: ' + e.message); process.exit(1); }
const { TCODES, addChargeRelatives, chBase } = X;
const base = TCODES.filter(c => c.type === 'c' && !c.rel && !c.rebFor && !c.adjFor && !c.rebate && !/^(Rebate|Adjust)\b/i.test(c.desc) && !['Paid Out', 'Deposit'].includes(c.dept));
T('there are charge codes', base.length > 5, base.length);
const missing = base.filter(c => !TCODES.some(t => t.rebFor === c.code) || !TCODES.some(t => t.adjFor === c.code));
T('every charge code has a Rebate and an Adjust (+)', missing.length === 0, missing.map(c => c.code).join(','));
const dup = base.filter(c => TCODES.filter(t => t.rebFor === c.code).length > 1 || TCODES.filter(t => t.adjFor === c.code).length > 1);
T('no code has two Rebates or two Adjusts (the old 398, 728, 729, 128 are reused)', dup.length === 0, dup.map(c => c.code).join(','));
T('the old ones are linked to their code', TCODES.find(t => t.code === '729').rebFor === '701' && TCODES.find(t => t.code === '128').adjFor === '100' && TCODES.find(t => t.code === '398').adjFor === '300');
const codes = TCODES.map(c => c.code);
T('no code number is used twice', new Set(codes).size === codes.length);
const r = TCODES.find(t => t.rebFor === '210'), a = TCODES.find(t => t.adjFor === '210');
T('a Rebate keeps the department, tab and VAT of its code', r && r.dept === 'F&B' && r.tab === TCODES.find(t => t.code === '210').tab && r.vat === TCODES.find(t => t.code === '210').vat && r.rebate === true && r.rel === true);
T('an Adjust (+) is named after its code', a && a.desc === 'Adjust - ' + TCODES.find(t => t.code === '210').desc + ' (+)');
T('every payment type still has its Refund', TCODES.filter(c => c.type === 'p' && !c.refund && !c.auto).every(p => TCODES.some(t => t.refFor === p.code)));
T('a relative points back to its code', chBase(r.code) === '210' && chBase('210') === '210');
/* a code added later (the provider's or a hotel's own) gets them too */
const added = addChargeRelatives([{ code: 'X1', desc: 'Spa', type: 'c', vat: false, dept: 'Spa', tab: 'SPA' }], { custom: true });
T('a new code gets both, flagged custom', added.length === 2 && added.some(c => c.rebFor === 'X1' && c.custom) && added.some(c => c.adjFor === 'X1'));
/* hide / open follows the code */
const hidden = { '210': true }; TCODES.forEach(c => { c.hidden = !!hidden[c.refFor || c.rebFor || c.adjFor || c.code]; });
T('hiding the code hides its Rebate and Adjust together', TCODES.find(t => t.code === '210').hidden && r.hidden && a.hidden && !TCODES.find(t => t.code === '100').hidden);
T('the wiring uses the same rule in the app', /c\.hidden=!!cat\.hidden\[c\.refFor\|\|c\.rebFor\|\|c\.adjFor\|\|c\.code\]/.test(src));
T('Rebate and Adjust (+) are listed as codes of their own in the hotel code list and are tiles in the Post window', /\(!c\.auto\|\|c\.code==='100'\)\)\.map/.test(src) && /ic\(isRb\(c\)\?'rebate'/.test(src) && !/&&!c\.rel\)\.map\(c=><tr><td>\$\{c\.code\}/.test(src));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
