/* Post titles and the standard 5-star codes: every code sits under a title, numbers never clash, each title has a number block.
     node tests/sync/titles-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const a = src.indexOf('const TCODES=['), b = src.indexOf("const HK_TABS");
if (a < 0 || b < 0) throw new Error('code not found');
const seg = src.slice(a, src.indexOf('\n', src.indexOf("'OTHER':[980,989]};", a)) + 1);
const X = new Function(seg + '\nreturn {TCODES,POST_TITLES_BASE,PAY_TITLES_BASE,TITLE_RANGE,addChargeRelatives};')();
const { TCODES, POST_TITLES_BASE, PAY_TITLES_BASE, TITLE_RANGE } = X;
const hk = (src.match(/const HK_TABS=\[([^\]]*)\]/) || [])[1] || '';

const codes = TCODES.map(c => c.code);
T('no two codes share a number', new Set(codes).size === codes.length);
const charges = TCODES.filter(c => c.type === 'c' && !c.rel && !c.auto && !c.adjFor && !c.rebFor && !c.rebate);
T('every charge code sits under a known title', charges.every(c => POST_TITLES_BASE.includes(c.tab)), charges.filter(c => !POST_TITLES_BASE.includes(c.tab)).map(c => c.code).join());
T('every payment method sits under a known title', TCODES.filter(c => c.type === 'p' && !c.refund).every(c => PAY_TITLES_BASE.includes(c.ptab)));
T('the 20 charge titles and 6 payment titles exist', POST_TITLES_BASE.length === 20 && PAY_TITLES_BASE.length === 6);
['MISSING & DAMAGE', 'TRAVEL & TOUR', 'TELEPHONE & COMMUNICATION', 'SHOP & GIFTS', 'FEES & TAXES', 'MEDICAL & WELLNESS', 'ENTERTAINMENT', 'CHILD CARE'].forEach(t =>
  T('title ' + t + ' exists and has codes', POST_TITLES_BASE.includes(t) && charges.some(c => c.tab === t)));
T('Damage and Breakage are under Missing & Damage', ['705', '703'].every(c => TCODES.find(x => x.code === c).tab === 'MISSING & DAMAGE'));
T('every title has a number block', POST_TITLES_BASE.concat(PAY_TITLES_BASE).every(t => TITLE_RANGE[t] && TITLE_RANGE[t][0] < TITLE_RANGE[t][1]));
const rs = POST_TITLES_BASE.map(t => [t, ...TITLE_RANGE[t]]).sort((p, q) => p[1] - q[1]);
T('charge number blocks do not overlap', rs.every((r, i) => i === 0 || rs[i - 1][2] < r[1]), rs.filter((r, i) => i && rs[i - 1][2] >= r[1]).map(r => r[0]).join());
const LEGACY = ['109', '410', '705', '702', '703', '722', '490', '701', '720', '721', '730', '128', '398', '728', '729'];
const out = charges.filter(c => !LEGACY.includes(c.code) && TITLE_RANGE[c.tab] && !(+c.code >= TITLE_RANGE[c.tab][0] && +c.code <= TITLE_RANGE[c.tab][1]));
T('every standard code is inside the number block of its title (the few older codes that moved keep their old numbers)', out.length === 0, out.map(c => c.code + '@' + c.tab).join());
T('each charge code has its Rebate and its Adjust (+)', charges.filter(c => !['Paid Out', 'Deposit'].includes(c.dept)).every(c => TCODES.some(r => r.rebFor === c.code) && TCODES.some(r => r.adjFor === c.code)));
T('every charge has a revenue line', charges.every(c => ['Room', 'F&B', 'Minibar', 'Other', 'Paid Out', 'Deposit'].includes(c.dept)));
T('HK Folio allows Minibar, Laundry, Missing & Damage and Misc.', /'MINIBAR'/.test(hk) && /'LAUNDRY'/.test(hk) && /'MISSING & DAMAGE'/.test(hk) && /'MISC\.'/.test(hk) && !/'ROOM'|'F&B'/.test(hk));
T('the catalog saved to the cloud counts titles as content', /v\.titles/.test(src) && /v\.payTitles/.test(src) && /v\.tmeta/.test(src));
T('the provider can add, rename, move, hide and delete titles', ['data-tadd', 'data-ttl', 'data-tup', 'data-tdn', 'data-thd', 'data-tdl'].every(k => src.includes(k)));
T('a new code gets its number from the title (automatic), typing is optional', /nextCode\(kind,key\)/.test(src) && /I want to type the number myself/.test(src));
process.exit(fails ? 1 : 0);
