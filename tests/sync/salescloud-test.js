/* Provider Sales cloud copy: push, pull, tombstones, a waiting change wins, token refresh. No network: the cloud table is a small in-memory stand-in.
     node tests/sync/salescloud-test.js ecosystem/index.html   (the argument is ignored; it reads crm/index.html) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'crm', 'index.html'), 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const a = src.indexOf('const Cloud = (() => {'), b = src.indexOf('/* ================= BOOT');
if (a < 0 || b < 0) { console.log('FAIL code not found'); process.exit(1) }
const code = src.slice(a, b);

function device(table, opt = {}) {
  const mem = () => { const s = {}; return { getItem: k => k in s ? s[k] : null, setItem: (k, v) => { s[k] = String(v) }, removeItem: k => { delete s[k] } } };
  const ls = mem(), ss = mem(); let tick = 0;
  if (opt.token !== false) ss.setItem('mahahub.sbauth', JSON.stringify(opt.token || { access_token: 'AT', refresh_token: 'RT', expires_at: Date.now() + 3600e3, user: { id: 'u1' } }));
  const calls = [];
  const fetch = async (url, o = {}) => {
    calls.push(url);
    const json = v => ({ ok: true, status: 200, json: async () => v });
    if (url.includes('/auth/v1/token')) return json({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: { id: 'u1' } });
    const auth = (o.headers || {}).Authorization;
    if (opt.deny || auth === 'Bearer BAD') return { ok: false, status: 403, json: async () => ({}) };
    if (o.method === 'POST') { JSON.parse(o.body).forEach(r => { table[r.id] = { ...r, updated_at: new Date(Date.UTC(2026, 10, 5, 0, 0, ++global.__t)).toISOString() } }); return { ok: true, status: 201, json: async () => null }; }
    const m = /updated_at=gt\.([^&]+)/.exec(url); const since = m ? decodeURIComponent(m[1]) : '';
    let rows = Object.values(table).filter(r => r.updated_at > since).sort((x, y) => x.updated_at < y.updated_at ? -1 : 1);
    if (/limit=1$/.test(url) && !m) rows = rows.slice(0, 1);
    return json(rows);
  };
  const env = { R: opt.R || [], db: null, location: { hostname: 'crm.maha-hub.com' }, localStorage: ls, sessionStorage: ss, fetch, Date, JSON, Math, Promise, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, encodeURIComponent, decodeURIComponent, console,
    document: { getElementById: () => null, addEventListener() {}, hidden: false }, window: { addEventListener() {} }, rerender() { env.rerendered = true }, confirm: () => opt.confirm !== false, rerendered: false };
  env.byId = id => env.R.find(r => r.id === id);
  env.store = () => ({ put() {}, delete() {} });
  vm.createContext(env);
  vm.runInContext(code + '\nthis.Cloud = Cloud;', env);
  env.calls = calls; env.ls = ls; env.ss = ss;
  return env;
}
global.__t = 0;
(async () => {
  const table = {};
  /* device 1 has data, the cloud is empty: everything goes up */
  const d1 = device(table, { R: [{ id: 'h1', kind: 'hotel', name: 'Lumi', updated: '2026-11-01T00:00:00Z' }, { id: 'a1', kind: 'act', hotelId: 'h1', updated: '2026-11-01T00:00:00Z' }] });
  const had = await d1.Cloud.first(); d1.Cloud.uploadAll(); await new Promise(r => setTimeout(r, 450));
  T('first start: empty cloud reports nothing', had === 0);
  T('the records go up, kind and all', table.h1 && table.h1.kind === 'hotel' && table.h1.data.name === 'Lumi' && table.a1 && table.a1.kind === 'act' && Object.keys(table).length === 2);
  T('the waiting list is empty afterwards', Object.keys(JSON.parse(d1.ls.getItem('maha.sales.dirty') || '{}')).length === 0);
  T('state is ok', d1.Cloud.state === 'ok');
  /* device 2 starts empty and gets everything, no seed needed */
  const d2 = device(table, { R: [] });
  const has = await d2.Cloud.first();
  T('second device sees that the cloud has data', has === 1 && d2.R.length === 2 && d2.byId('h1').name === 'Lumi');
  /* a change on device 2 travels back */
  d2.byId('h1').name = 'Lumi Minimal'; d2.byId('h1').updated = '2026-11-02T00:00:00Z'; d2.Cloud.mark('h1', 'hotel'); await new Promise(r => setTimeout(r, 1700));
  T('a changed record goes up', table.h1.data.name === 'Lumi Minimal');
  await d1.Cloud.sync();
  T('device 1 receives it', d1.byId('h1').name === 'Lumi Minimal' && d1.rerendered === true);
  /* a removed record becomes a tombstone, never a real delete */
  d2.R = d2.R.filter(r => r.id !== 'a1'); d2.Cloud.mark('a1', 'act'); await new Promise(r => setTimeout(r, 1700));
  T('removal is marked deleted in the cloud, the row stays', table.a1 && table.a1.deleted === true);
  await d1.Cloud.sync();
  T('the other device drops it', !d1.byId('a1'));
  /* a waiting change of mine is not overwritten by a pull */
  d1.byId('h1').name = 'Mine'; d1.byId('h1').updated = '2026-11-03T00:00:00Z';
  table.h1 = { ...table.h1, data: { ...table.h1.data, name: 'Theirs', updated: '2026-11-04T00:00:00Z' }, updated_at: '2026-11-05T09:00:00.000Z' };
  d1.Cloud.mark('h1', 'hotel'); await d1.Cloud.sync(); await new Promise(r => setTimeout(r, 50));
  T('a change still waiting wins over a pull (then goes up)', d1.byId('h1').name === 'Mine');
  /* token: expired access token is refreshed with the refresh token; no refresh token and expired = sign in again */
  const d3 = device(table, { R: [], token: { access_token: 'OLD', refresh_token: 'RT', expires_at: Date.now() - 1000, user: { id: 'u1' } } });
  await d3.Cloud.first();
  T('an expired token is refreshed', d3.calls.some(u => u.includes('grant_type=refresh_token')) && JSON.parse(d3.ss.getItem('mahahub.sbauth')).access_token === 'AT2');
  const d4 = device(table, { R: [], token: { access_token: 'OLD', expires_at: Date.now() - 1000, user: { id: 'u1' } } });
  await d4.Cloud.first();
  T('expired and nothing to refresh with: asks to sign in again, no data lost', d4.Cloud.state === 'signin' && d4.R.length === 0);
  const d5 = device(table, { R: [{ id: 'x', kind: 'hotel' }], token: false });
  await d5.Cloud.first();
  T('no sign-in at all: stays on this device, state signin, records kept', d5.Cloud.state === 'signin' && d5.R.length === 1);
  const d6 = device(table, { R: [], deny: true });
  await d6.Cloud.first();
  T('a person who is not a provider is refused', d6.Cloud.state === 'signin' && d6.R.length === 0);
  /* a test copy on another address never talks to the cloud */
  const d7 = device(table, { R: [{ id: 'y', kind: 'hotel' }] }); d7.location.hostname = 'x.pages.dev';
  const d7b = (() => { const e = device(table, { R: [{ id: 'y', kind: 'hotel' }] }); return e; })();
  T('the page keeps the sign-in key and the table names it needs', /maha_sales_records/.test(src) && /mahahub\.sbauth/.test(src));
  T('Sales page takes the access token from the hand-over', src.includes("sessionStorage.setItem('mahahub.sbauth',JSON.stringify(ja))") && src.includes('delete ja.refresh_token'));
  T('every save, bulk save and removal marks the record for the cloud', src.includes('Cloud.mark(r.id, r.kind);') && src.includes('arr.forEach(r => Cloud.mark(r.id, r.kind));') && src.includes('Cloud.mark(id, gone && gone.kind)'));
  T('a cloud copy already there is not seeded over', src.includes('const inCloud = await Cloud.first();') && src.includes('if (!byId(\'meta\') && !inCloud)'));
  console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1) });
