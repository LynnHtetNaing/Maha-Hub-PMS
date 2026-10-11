/* Provider-wide settings (code catalog + payment logos): client logic against a fake server that follows the rules of
   maha_get_platform_settings / maha_platform_settings_versions / maha_save_platform_setting.
   Usage: node tests/sync/platset-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('cut ' + a); return src.slice(i, j); };
const helpers = cut('function msStable(v){', '/* Copy of a record that is safe');
const platset = cut('/* ---------- provider-wide settings kept in the cloud', '/* After a page reload the sign-in token');

let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const cloud = { rows: new Map(), calls: [], down: false, noAccess: false };
function rpc(role, name, body) {
  cloud.calls.push(role + ':' + name);
  if (cloud.down) throw new TypeError('Failed to fetch');
  if (cloud.noAccess) { const e = new Error('forbidden'); e.status = 403; throw e; }
  if (name === 'maha_get_platform_settings') { const o = {}; cloud.rows.forEach((v, k) => { o[k] = { data: JSON.parse(JSON.stringify(v.data)), version: v.version }; }); return o; }
  if (name === 'maha_platform_settings_versions') { const o = {}; cloud.rows.forEach((v, k) => { o[k] = v.version; }); return o; }
  if (name === 'maha_save_platform_setting') {
    if (role !== 'provider') { const e = new Error('forbidden'); e.status = 403; throw e; }
    const k = body.p_key, cur = cloud.rows.get(k), exp = body.p_expected_version || 0;
    if (!['catalog', 'pay_logos'].includes(k)) { const e = new Error('invalid-key'); e.status = 400; throw e; }
    if (!cur) { if (exp !== 0) return { conflict: true, version: 0, data: null }; cloud.rows.set(k, { data: JSON.parse(JSON.stringify(body.p_data)), version: 1 }); return { ok: true, version: 1 }; }
    if (cur.version !== exp) return { conflict: true, version: cur.version, data: JSON.parse(JSON.stringify(cur.data)) };
    cloud.rows.set(k, { data: JSON.parse(JSON.stringify(body.p_data)), version: cur.version + 1 }); return { ok: true, version: cur.version + 1 };
  }
  throw new Error('rpc ' + name);
}

function device(role, localDB) {
  const ctx = { DB: Object.assign({ hotels: {}, session: role === 'provider' ? { provider: true } : { hotel: 'H1' } }, localDB || {}), toasts: [], applied: 0, remote: 0 };
  const body = `
    let DB=ctx.DB;
    const MahaAuth={rpc:async(n,b)=>rpc(role,n,b)};
    const MahaSync={onRemote:()=>{ctx.remote++}};
    const toast=m=>ctx.toasts.push(m);
    const applyCatalog=()=>{ctx.applied++;DB.catalog=DB.catalog||{charges:[],payments:[],hidden:{}}};
    ${helpers}
    ${platset}
    ctx.api=PlatSet;
  `;
  new Function('ctx', 'rpc', 'role', body)(ctx, rpc, role);
  return ctx;
}
const cat = (...codes) => ({ charges: codes.map(c => ({ code: c, desc: c })), payments: [], hidden: {} });
const codes = d => (d.DB.catalog ? d.DB.catalog.charges.map(c => c.code).join(',') : '');

(async () => {
  /* nothing anywhere: nothing is uploaded */
  const E = device('provider', {});
  await E.api.begin(); E.api.stop();
  T('provider with nothing local and nothing in the cloud uploads nothing', cloud.rows.size === 0 && !cloud.calls.some(c => c.includes('save')));

  /* provider device A has its own catalog: first sign-in uploads it (never overwrites the cloud) */
  const A = device('provider', { catalog: cat('SPA'), payLogos: { VISA: 'data:image/png;base64,AAAA' } });
  await A.api.begin(); A.api.stop();
  T('first sign-in uploads this device\'s catalog and logos to the empty cloud', cloud.rows.get('catalog').version === 1 && cloud.rows.get('pay_logos').version === 1 && cloud.rows.get('catalog').data.charges[0].code === 'SPA');

  /* hotel staff device: gets the provider's catalog and logos, can never write */
  const S = device('staff', {});
  await S.api.begin(); S.api.stop();
  T('staff device loads the provider\'s catalog and logos at sign-in', codes(S) === 'SPA' && S.DB.payLogos.VISA === 'data:image/png;base64,AAAA');
  T('the shared codes are applied to the staff screens', S.applied >= 1);
  const callsBefore = cloud.calls.length;
  S.DB.catalog.charges.push({ code: 'HACK' });
  await S.api.push();
  T('staff device never writes (no save call is even made)', !cloud.calls.slice(callsBefore).some(c => c.includes('save')));

  /* provider adds a code on A -> staff sees it after their next check */
  A.DB.catalog.charges.push({ code: 'GYM', desc: 'GYM' });
  await A.api.push();
  T('provider change is saved as a new version', cloud.rows.get('catalog').version === 2);
  const S2 = device('staff', {});
  await S2.api.begin(); S2.api.stop();
  await A.api.pull();
  S.DB.catalog = cat('SPA');                 /* staff device as it was before the change */
  S.api.ver.catalog = 1; S.api.hash.catalog = S.api.hashOf(S.DB.catalog);
  S.remote = 0;
  await S.api.pull();
  T('staff device notices the new version and updates (screen refresh requested)', codes(S) === 'SPA,GYM' && S.remote === 1, codes(S));
  const noChangeCalls = cloud.calls.length;
  await S.api.pull();
  T('when nothing changed only the cheap version check runs', cloud.calls.slice(noChangeCalls).join() === 'staff:maha_platform_settings_versions');

  /* a second device of the provider takes the cloud copy instead of overwriting it */
  const B = device('provider', { catalog: cat('OLDLOCAL') });
  await B.api.begin(); B.api.stop();
  T('second provider device takes the cloud copy (its old local list does not overwrite it)', codes(B) === 'SPA,GYM' && cloud.rows.get('catalog').version === 2);

  /* two devices edit at once: the first save wins, the other is told and gets the latest */
  A.DB.catalog.charges.push({ code: 'FROMA', desc: 'x' });
  B.DB.catalog.charges.push({ code: 'FROMB', desc: 'x' });
  await A.api.push();
  await B.api.push();
  T('second device\'s stale save is refused, it receives the latest copy and a clear message', codes(B) === 'SPA,GYM,FROMA' && B.toasts.some(t => /Another device of yours changed/.test(t)) && cloud.rows.get('catalog').version === 3, codes(B));
  B.DB.catalog.charges.push({ code: 'FROMB', desc: 'x' });
  await B.api.push();
  T('after that, the repeated change saves normally', cloud.rows.get('catalog').version === 4 && cloud.rows.get('catalog').data.charges.some(c => c.code === 'FROMB'));

  /* provider deletes everything: that is saved too (not mistaken for "nothing to upload") */
  B.DB.catalog = { charges: [], payments: [], hidden: {} };
  await B.api.push();
  T('emptying the catalog is saved to the cloud', cloud.rows.get('catalog').data.charges.length === 0 && cloud.rows.get('catalog').version === 5);

  /* oversized logos are refused locally with a message, no call */
  const big = device('provider', { payLogos: { X: 'a'.repeat(3100000) } });
  const c0 = cloud.calls.length;
  await big.api.push();
  T('logos over the size limit are refused with a message and nothing is sent', big.toasts.some(t => /too large/.test(t)) && !cloud.calls.slice(c0).some(c => c.includes('save')));

  /* trouble never breaks sign-in */
  cloud.down = true;
  const O = device('provider', { catalog: cat('Z') });
  let threw = false; try { await O.api.begin(); } catch (e) { threw = true; }
  T('offline at sign-in: begin() does not throw, the local copy is kept', !threw && codes(O) === 'Z');
  O.api.stop();
  cloud.down = false; cloud.noAccess = true;
  const N = device('staff', {});
  threw = false; try { await N.api.begin(); } catch (e) { threw = true; }
  T('an older server (no access / no function): sign-in is not affected', !threw);
  N.api.stop(); cloud.noAccess = false;

  /* a push that fails (offline) is retried later with the same change */
  const R = device('provider', { catalog: cat('RETRY') });
  cloud.rows.clear();
  R.api.ver = {}; R.api.hash = {};
  cloud.down = true; await R.api.push(); cloud.down = false;
  T('a failed upload leaves the change pending', cloud.rows.size === 0 && R.api.hash.catalog === undefined);
  await R.api.push();
  T('and the next attempt uploads it', cloud.rows.get('catalog') && cloud.rows.get('catalog').data.charges[0].code === 'RETRY');

  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
