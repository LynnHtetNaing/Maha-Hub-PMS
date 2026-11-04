/* Maha Sales (crm) sign-in: password, emailed code, only the sales team goes on, lock after 15 quiet minutes, sign out after 1 hour, token refresh, sign out.
   No network: the sign-in service is a small stand-in.   node tests/sync/crmauth-test.js ecosystem/index.html   (the argument is ignored) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'crm', 'index.html'), 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const a = src.indexOf('const Auth = (() => {'), b = src.indexOf('/* ================= CLOUD');
if (a < 0 || b < 0) { console.log('FAIL code not found'); process.exit(1) }
const code = src.slice(a, b);

function page(host, service) {
  const mem = {}; const ls = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] } };
  const clock = { t: 1e12 }, calls = [];
  const fetch = async (url, o = {}) => {
    calls.push({ url, body: o.body ? JSON.parse(o.body) : null, headers: o.headers || {} });
    const r = service(url, o);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  const env = { location: { hostname: host }, localStorage: ls, fetch, Date: { now: () => clock.t }, JSON, Math, Promise, setTimeout, setInterval: () => 0, encodeURIComponent, btoa: s => Buffer.from(s, 'binary').toString('base64'), String, Uint8Array, crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 3) & 255; return a } },
    document: { addEventListener() {}, getElementById: () => null, hidden: false, body: { classList: { add() {}, remove() {} } } } };
  vm.createContext(env); vm.runInContext(code + '\nthis.Auth = Auth;', env);
  return { Auth: env.Auth, clock, calls, ls, mem };
}
const session = (extra) => ({ status: 200, body: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, user: { id: 'u1' }, ...extra } });
const svc = (state = {}) => (url, o) => {
  const body = o.body ? JSON.parse(o.body) : {};
  if (url.includes('/functions/v1/username-auth')) {
    if (state.refuse) return { status: 403, body: { error: 'not_allowed' } };
    if (body.action === 'verify_code') return body.code === '123456' ? session() : { status: 401, body: { error: 'code_wrong' } };
    if (body.password === 'bad') return { status: 401, body: { error: 'invalid_credentials' } };
    if (state.needCode && !state.trusted) return { status: 200, body: { needs_code: true, challenge: 'c-1', sent_to: 'a***@x.com' } };
    return session();
  }
  if (url.includes('maha_crm_members')) return { status: 200, body: state.noName ? [] : [{ name: 'Ma Hla' }] };
  if (url.includes('grant_type=refresh_token')) return state.refreshFails ? { status: 400, body: {} } : { status: 200, body: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: { id: 'u1' } } };
  if (url.includes('/auth/v1/logout')) return { status: 204, body: null };
  return { status: 404, body: {} };
};
(async () => {
  let p = page('crm.maha-hub.com', svc());
  T('on its own address a sign-in is required, and nobody is signed in at first', p.Auth.required === true && p.Auth.status() === 'out' && (await p.Auth.token()) === null);
  let r = await p.Auth.signIn('mahla', 'bad'); T('a wrong password is refused', r.error === 'invalid' && p.Auth.status() === 'out');
  T('every request says app = crm and carries a device id', p.calls[0].body.app === 'crm' && /^[A-Za-z0-9_-]{16,64}$/.test(p.calls[0].body.device_id));
  p = page('crm.maha-hub.com', svc({ refuse: true })); r = await p.Auth.signIn('hotelguy', 'x');
  T('a person who is not on the team is refused right after the password: no session, no code step', r.error === 'not_allowed' && !r.needCode && p.Auth.status() === 'out' && !p.calls.some(c => c.body && c.body.action === 'verify_code'));
  p = page('crm.maha-hub.com', svc({ needCode: true })); r = await p.Auth.signIn('mahla', 'good');
  T('a new device asks for the emailed code, and no session exists yet', !!r.needCode && r.needCode.challenge === 'c-1' && p.Auth.status() === 'out');
  r = await p.Auth.verify('mahla', 'c-1', '000000', true); T('a wrong code is refused', r.error === 'wrong' && p.Auth.status() === 'out');
  r = await p.Auth.verify('mahla', 'c-1', '123456', true);
  T('the right code signs in, and the person\'s name is read from the team list', r.ok === true && p.Auth.status() === 'ok' && p.Auth.who() === 'Ma Hla');
  T('the session is kept on this device (so the phone app stays signed in until the idle rules say otherwise)', JSON.parse(p.ls.getItem('maha.crm.auth')).refresh_token === 'RT1');
  p.clock.t += 14 * 60e3; T('14 quiet minutes: still open', p.Auth.status() === 'ok' && (await p.Auth.token()) !== null);
  p.clock.t += 2 * 60e3; T('16 quiet minutes: the screen locks, and the cloud copy gets no token', p.Auth.status() === 'locked' && (await p.Auth.token()) === null);
  p.clock.t += 50 * 60e3; T('over 1 hour quiet: signed out, the session is gone', p.Auth.status() === 'out' && p.ls.getItem('maha.crm.auth') === null);
  /* trusted device: no code */
  p = page('crm.maha-hub.com', svc({ needCode: true, trusted: true })); r = await p.Auth.signIn('mahla', 'good');
  T('a trusted device signs in with the password only', r.ok === true && p.Auth.status() === 'ok');
  /* refresh */
  const active = (pg, min) => { pg.clock.t += min * 60e3; const s = pg.Auth.session(); if (s) s.last = pg.clock.t; };
  for (let k = 0; k < 4; k++) active(p, 12); active(p, 11);   /* the person is active; the access token (1 hour) is about to end */
  const tk = await p.Auth.token();
  T('an access token about to end is renewed with the refresh token', tk === 'AT2' && JSON.parse(p.ls.getItem('maha.crm.auth')).refresh_token === 'RT2');
  p = page('crm.maha-hub.com', svc({ trusted: true, refreshFails: true })); await p.Auth.signIn('mahla', 'good');
  for (let k = 0; k < 4; k++) active(p, 12); active(p, 11);
  const lost = await p.Auth.token();
  T('a refresh that is refused (the person was switched off) signs the person out at once', lost === null && p.Auth.status() === 'out' && p.ls.getItem('maha.crm.auth') === null);
  p = page('crm.maha-hub.com', svc({ trusted: true })); await p.Auth.signIn('mahla', 'good'); p.Auth.signOut();
  T('sign out clears the session and tells the server', p.Auth.status() === 'out' && p.calls.some(c => c.url.includes('/auth/v1/logout')) && p.ls.getItem('maha.crm.auth') === null);
  /* a test copy */
  p = page('maha-hub.pages.dev', svc());
  T('a test copy on another address asks for nothing and keeps to this device', p.Auth.required === false && p.Auth.status() === 'ok' && (await p.Auth.token()) === null && p.Auth.session() === null);
  /* the page */
  T('the page waits for the sign-in before it reads its data', /await Auth\.require\(\);\s*try \{ db = await openDB\(\);/.test(src));
  T('no entry ticket and no hand-over any more', !/mahahub\.entry/.test(src) && !/#mh=/.test(src));
  T('installable: manifest, standalone, offline service worker, install button', fs.readFileSync(path.resolve(__dirname, '..', '..', 'crm', 'manifest.webmanifest'), 'utf8').includes('"display": "standalone"') && src.includes('beforeinstallprompt') && src.includes("serviceWorker.register('sw.js')"));
  console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1) });
