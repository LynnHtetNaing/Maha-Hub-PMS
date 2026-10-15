/* Emailed sign-in code: the page side (MahaAuth.signIn / codeStep / deviceId) against a fake username-auth that follows
   the same rules as the real function, plus checks on the function source. No network, no secrets. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('cut ' + a); return src.slice(i, j); };
const code = cut('const MAHA_AUTH_CONFIG', 'function loadDB(){') + '\n' + cut('const TCV_PREFIX', 'function sessionValid(se){');
const fnSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'username-auth', 'index.ts'), 'utf8');

const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mkStore = o => ({ getItem: k => k in o ? o[k] : null, setItem: (k, v) => { o[k] = String(v) }, removeItem: k => { delete o[k] }, key: i => Object.keys(o)[i], get length() { return Object.keys(o).length } });

/* the server: trusted devices, one challenge per sign-in, 5 tries, 30 days */
function makeServer() {
  const S = { require: true, trusted: new Map(), challenges: new Map(), posts: [], sent: [], now: Date.now(), mailDown: false, mailLimited: false, code: '482915' };
  S.handle = async (b) => {
    S.posts.push(b);
    const pwOk = b.username === 'front.desk' && (b.action === 'verify_code' || b.password === 'pw-ok');
    if (!pwOk) return resp(401, { error: 'invalid_credentials' });
    const tokens = { access_token: 'tok-U1', refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: 'U1', email: 'f***@x.test' } };
    const dev = /^[A-Za-z0-9_-]{16,64}$/.test(b.device_id || '') ? b.device_id : '';
    if (b.action === 'verify_code') {
      const c = S.challenges.get(b.challenge);
      if (!S.require || !dev || !c || c.dev !== dev || c.used) return resp(401, { error: 'code_wrong' });
      if (c.exp < S.now) return resp(401, { error: 'code_expired' });
      if (c.tries >= 5) return resp(401, { error: 'code_locked' });
      c.tries++;
      if (b.code !== S.code) return resp(401, { error: 'code_wrong' });
      c.used = true; if (b.remember === true) S.trusted.set(dev, S.now);
      return resp(200, tokens);
    }
    if (S.require) {
      if (!dev) return resp(409, { error: 'device_required' });
      const last = S.trusted.get(dev);
      if (!(last && last > S.now - 30 * 86400000)) {
        if (S.mailLimited) return resp(429, { error: 'code_rate_limited' });
        if (S.mailDown) return resp(503, { error: 'code_not_sent' });
        const id = '00000000-0000-4000-8000-' + String(S.challenges.size + 1).padStart(12, '0');
        S.challenges.set(id, { dev, exp: S.now + 600000, tries: 0, used: false }); S.sent.push(id);
        return resp(200, { needs_code: true, challenge: id, sent_to: 'f***@x.test' });
      }
    }
    return resp(200, tokens);
  };
  return S;
}
function device(server, ls = {}) {
  const ctx = { asked: [], answers: [] };
  const localStorage = mkStore(ls), sessionStorage = mkStore({});
  const fetch = async (url, opt = {}) => /functions\/v1\/username-auth/.test(url) ? server.handle(JSON.parse(opt.body)) : resp(404, {});
  const body = `
    const location={hostname:'localhost',search:'?auth=supabase'};const window={addEventListener(){}};const document={};
    let DB={};const esc=s=>s,fld=()=>'',modal=()=>({}),closeModal=()=>{};
    ${code}
    ctx.api={MahaAuth};
  `;
  new Function('ctx', 'localStorage', 'sessionStorage', 'URLSearchParams', 'fetch', 'crypto', 'btoa', body)(ctx, localStorage, sessionStorage, URLSearchParams, fetch, require('crypto').webcrypto, s => Buffer.from(s, 'binary').toString('base64'));
  ctx.api.MahaAuth.askEmailCode = async (info, again) => { ctx.asked.push({ info, again }); return ctx.answers.length ? ctx.answers.shift() : null; };
  ctx.ls = ls; return ctx;
}
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
(async () => {
  const S = makeServer();
  /* device id: made once, kept, and valid */
  let A = device(S);
  const id1 = A.api.MahaAuth.deviceId(), id2 = A.api.MahaAuth.deviceId();
  T('device id is created, valid and stays the same', /^[A-Za-z0-9_-]{16,64}$/.test(id1) && id1 === id2 && A.ls['maha.deviceId'] === id1);
  T('another browser gets another id', device(S).api.MahaAuth.deviceId() !== id1);

  /* wrong password is still just "invalid" (no code is sent) */
  let r = await A.api.MahaAuth.signIn('front.desk', 'nope');
  T('wrong password -> invalid, no code sent', !r.ok && r.reason === 'invalid' && S.sent.length === 0);

  /* new device: asked for the code; wrong code first, then the right one with "register this device" */
  A.answers.push({ code: '111111', remember: true }, { code: S.code, remember: true });
  r = await A.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('new device -> code box shown, wrong code asks again, right code signs in', r.ok && r.tokens.access_token === 'tok-U1' && A.asked.length === 2 && A.asked[0].again === '' && /not correct/.test(A.asked[1].again) && A.asked[0].info.sentTo === 'f***@x.test');
  T('the password is sent once, the code step never sends the password', S.posts.filter(p => p.password).length === 2 && S.posts.filter(p => p.action === 'verify_code').every(p => p.password === undefined));

  /* registered: no code the next time */
  A.asked.length = 0;
  r = await A.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('registered device -> signs in without a code', r.ok && A.asked.length === 0);

  /* after 30 days: asked again */
  S.now += 31 * 86400000;
  A.answers.push({ code: S.code, remember: true });
  r = await A.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('31 days later -> code asked again', r.ok && A.asked.length === 1);
  S.now += 29 * 86400000; A.asked.length = 0;
  r = await A.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('29 days after the last code -> still trusted', r.ok && A.asked.length === 0);

  /* not registered: asked every time */
  let B = device(S);
  B.answers.push({ code: S.code, remember: false }, { code: S.code, remember: false });
  r = await B.api.MahaAuth.signIn('front.desk', 'pw-ok');
  const r2 = await B.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('"Register this device" not ticked -> asked every sign-in', r.ok && r2.ok && B.asked.length === 2);

  /* cancel */
  let C = device(S); C.answers.push(null);
  r = await C.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('cancel -> not signed in, nothing kept', !r.ok && r.reason === 'cancelled' && !r.tokens && !C.api.MahaAuth.read());

  /* five wrong codes -> the attempt is dead */
  let D = device(S); for (let i = 0; i < 6; i++) D.answers.push({ code: '000000', remember: true });
  r = await D.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('five wrong codes -> stopped with a clear message', !r.ok && r.reason === 'code' && /Too many wrong codes/.test(r.message) && D.asked.length === 5, r.message);

  /* expired code */
  let E = device(S); E.answers.push({ code: S.code, remember: true });
  const origHandle = S.handle; S.handle = async b => { if (b.action === 'verify_code') S.now += 11 * 60000; return origHandle(b) };
  r = await E.api.MahaAuth.signIn('front.desk', 'pw-ok');
  S.handle = origHandle;
  T('code typed after 10 minutes -> expired message', !r.ok && r.reason === 'code' && /expired/.test(r.message), r.message);

  /* new code on request signs in with the NEW challenge */
  let F = device(S); F.answers.push({ resend: true }, { code: S.code, remember: false });
  const before = S.sent.length;
  r = await F.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('"Send a new code" starts a fresh sign-in and works', r.ok && S.sent.length === before + 2 && F.asked.length === 2);

  /* email trouble: clear messages, never signed in */
  S.mailDown = true; let G = device(S);
  r = await G.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('email could not be sent -> message, not signed in', !r.ok && r.reason === 'code' && /could not be sent/.test(r.message) && G.asked.length === 0, r.message);
  S.mailDown = false; S.mailLimited = true;
  r = await G.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('too many code emails -> wait message', !r.ok && /one minute/.test(r.message), r.message);
  S.mailLimited = false;

  /* old page / no device id is refused by the server, with a message that says reload */
  const noDev = await S.handle({ action: 'login', username: 'front.desk', password: 'pw-ok' });
  T('server refuses a sign-in without a device id', noDev.status === 409);
  S.handle = async () => resp(409, { error: 'device_required' });
  r = await device(S).api.MahaAuth.signIn('front.desk', 'pw-ok'); S.handle = origHandle;
  T('page shows "reload" for that', !r.ok && /Reload/.test(r.message));

  /* code feature off on the server: sign-in works exactly as before */
  S.require = false; let H = device(S);
  r = await H.api.MahaAuth.signIn('front.desk', 'pw-ok');
  T('code check switched off -> normal sign-in, no box', r.ok && H.asked.length === 0);

  /* the function file: the safety rules are in the source */
  T('function: off unless MAHA_REQUIRE_CODE=on', /MAHA_REQUIRE_CODE/.test(fnSrc) && /toLowerCase\(\) === "on"/.test(fnSrc));
  T('function: no session is returned before the code (needs_code branch comes before the session reply)', fnSrc.indexOf('needs_code: true') > 0 && fnSrc.indexOf('needs_code: true') < fnSrc.lastIndexOf('return sessionBody({ session: data.session'));
  T('function: fails closed when the trust check errors', /trustError\) return json\(\{ error: "code_unavailable" \}, 503\)/.test(fnSrc));
  T('function: the password session is closed locally, not for other devices', /signOut\(data\.session\.access_token, "local"\)/.test(fnSrc));
  T('function: only a hash of the device id is used', /sha256Hex\(deviceId\)/.test(fnSrc) && !/p_device_hash:\s*deviceId/.test(fnSrc));
  T('function: counts the try before checking the code', fnSrc.indexOf('maha_login_challenge_try') < fnSrc.indexOf('verifyOtp'));
  T('function: never logs the code or the password', !/logEvent\([^;]*\b(password|code|body)\b/.test(fnSrc.replace(/"[^"\n]*"/g, '""').replace(/body\.remember/g, 'R').replace(/code\?:|\.code\b/g, 'E')));   /* the Auth error code of a banned account is not the typed code */
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
