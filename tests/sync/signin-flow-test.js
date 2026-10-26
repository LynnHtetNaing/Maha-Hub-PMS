/* Sign-in flow: who sees Backend, and what the Frontend and Backend menus contain.
     node tests/sync/signin-flow-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const mStart = src.indexOf('const MENU=['), mEnd = src.indexOf('const PROV_MENU');
const a = src.indexOf('/* ---- who sees what ---- */'), b = src.indexOf('/* ---- the two pages ---- */');
if (mStart < 0 || mEnd < 0 || a < 0 || b < 0) throw new Error('code not found');

function build(env) {
  return new Function('DB', 'H', 'can', 'viewAllowed', 'firstHotelView', 'withLoading', 'renderShell', 'go', 'writeLiveSession','ensureFlowCss',
    src.slice(mStart, mEnd) + '\n' + src.slice(a, b) +
    '\nreturn {MENU,hasBackend,curArea,setArea,BACKEND_MENU,areaMenu,firstBackendView,areaSwitchHtml};')(
    env.DB, env.H, env.can, env.viewAllowed || (() => true), () => 'fo.status', async (m, ms, fn) => fn(), () => {}, () => {}, () => {}, () => {});
}
const hotel = { set: { name: 'Test' } };
const staff = build({ DB: { session: { userId: 'u1', hotel: 'T' } }, H: hotel, can: p => p !== 'setup' });
const mgr = build({ DB: { session: { userId: 'u2', hotel: 'T' } }, H: hotel, can: () => true });
const prov = build({ DB: { session: { provider: true, userId: 'p' } }, H: hotel, can: () => true });

T('staff without the Setup permission do not get Backend', staff.hasBackend() === false);
T('a manager with the Setup permission gets Backend', mgr.hasBackend() === true);
T('the provider does not use the Frontend / Backend split', prov.hasBackend() === false);
T('a stored "back" area is ignored for people without Backend', (() => { staff.setArea('back'); return staff.curArea() === 'front' })());
mgr.setArea('front'); T('the area starts as Frontend', mgr.curArea() === 'front');
mgr.setArea('back'); T('a manager can be in Backend', mgr.curArea() === 'back');

const ids = g => g.flatMap(x => (x.items || []).map(i => i[1]));
const back = mgr.BACKEND_MENU(), backIds = ids(back);
['set.hotel', 'set.rooms', 'set.codes', 'set.users', 'ac.buy', 'set.backup', 'profile.rates', 'res.rate', 'profile.companies'].forEach(v =>
  T('Backend holds ' + v, backIds.includes(v)));
T('Backend does NOT hold Functions (provider only)', !backIds.includes('set.features'));
T('Backend holds no provider-console page', !backIds.some(v => /^prov\./.test(v)));
T('Backend has a Report entry', back.some(g => g.report));
mgr.setArea('back'); T('in Backend the menu is the Backend menu', mgr.areaMenu(mgr.MENU).map(g => g.t).join('|') === back.map(g => g.t).join('|'));
mgr.setArea('front');
const front = mgr.areaMenu(mgr.MENU), frontIds = ids(front);
T('Frontend drops the Setup group', !front.some(g => g.t === 'Setup'));
T('Frontend keeps the daily groups', ['Front Office', 'Reservation', 'Billing / Folio', 'Room Management', 'Close Day'].every(t => front.some(g => g.t === t)));
T('Frontend holds no set-up page', !['set.hotel', 'set.rooms', 'set.codes', 'set.users', 'set.backup'].some(v => frontIds.includes(v)));
T('provider menus are left alone', prov.areaMenu(prov.MENU) === prov.MENU);
T('staff always get the Frontend menu without Setup', !staff.areaMenu(staff.MENU).some(g => g.t === 'Setup'));
T('the first Backend screen is Hotel Settings', mgr.firstBackendView() === 'set.hotel');
T('the Frontend / Backend switch shows only for managers', mgr.areaSwitchHtml().includes('Backend') && staff.areaSwitchHtml() === '');
process.exit(fails ? 1 : 0);
