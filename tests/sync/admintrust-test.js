/* The admin and a trusted device: Console unchanged (Authenticator every time); another system takes the password only on a device the admin
   trusted for 14 days and opens LIMITED (view only); new device / after 14 days = Authenticator (QR on the first time); Reset Authenticator and
   Forget my trusted devices. Source checks of the pages, the two functions and the migration.
     node tests/sync/admintrust-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const pms = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const crm = rd('crm/index.html'), bill = rd('billing/index.html'), shared = rd('brand/maha/maha-admin-mfa.js');
const ua = rd('supabase/functions/username-auth/index.ts'), pap = rd('supabase/functions/platform-admin-provision/index.ts');
const mig = rd('supabase/migrations/20261112_041_admin_trusted_devices.sql');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

/* ---- the database ---- */
T('devices are trusted for 14 days and sessions for 12 hours; the tables and helpers are for the service role only', mig.includes('p_days integer default 14') && mig.includes('p_hours integer default 12') && mig.includes('revoke all on public.maha_admin_devices from public, anon, authenticated') && mig.includes('grant execute on function public.maha_admin_trust_device(uuid, text) to service_role'));
T('writing stays aal2 only (maha_owner_session_ok); an active admin without an Authenticator no longer passes', mig.includes("coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'") && mig.includes('not exists (select 1 from public.maha_platform_admins a where a.user_id = (select auth.uid()) and a.active)'));
T('reading (hotels, admin power for Sales / Billing) also accepts a registered trusted session', mig.includes('create or replace function public.maha_owner_read_ok()') && mig.includes('maha_admin_sessions s') && mig.includes('and public.maha_owner_read_ok();') && mig.includes('and public.maha_owner_read_ok()\n    )'));
T('Reset Authenticator removes the factors and forgets the trusted devices', mig.includes('delete from auth.mfa_factors where user_id = p_user') && mig.includes('perform public.maha_admin_forget_devices(p_user)'));

/* ---- the sign-in function ---- */
T('sign-in function: 14 day admin device, 12 hour session, answers admin_mode limited / needs_mfa', ua.includes('ADMIN_TRUST_DAYS = 14') && ua.includes('ADMIN_SESSION_HOURS = 12') && ua.includes('adminMode = "limited"') && ua.includes('adminMode = "needs_mfa"') && ua.includes('admin_mode: adminMode'));
T('sign-in function: a failed check keeps the safe answer (needs_mfa) and the password session never registers on its own', ua.includes('an error keeps the safe value') && ua.includes('maha_admin_register_session') && ua.includes('maha_admin_device_ok'));
T('trust_device needs the caller\'s own aal2 session and an active admin', ua.includes('body.action === "trust_device"') && ua.includes('jwtPart(token, "aal") !== "aal2"') && ua.includes('maha_admin_trust_device'));
T('both sign-in replies (password and emailed code) go through the same admin step', ua.split('return await sessionBody(').length - 1 === 2);

/* ---- the provisioning function ---- */
T('Reset Authenticator is Master only and never for the Master; forget my devices is for any admin on their own devices', pap.includes('action === "admin_reset_mfa"') && pap.includes('maha_admin_reset_mfa') && pap.includes('if (action === "forget_my_devices")') && pap.indexOf('forget_my_devices") {') < pap.indexOf('if (!isMaster) return respond({ error: "master_only" }'));

/* ---- the PMS page ---- */
T('PMS: the admin kind comes from maha_admin_mode (old question as a fallback)', pms.includes("this.rpc('maha_admin_mode',{})") && pms.includes("this.rpc('maha_is_platform_admin',{}).then(v=>v===true?'none':''"));
T('PMS: Console (or a single address) always asks the Authenticator; another system on a trusted device opens limited with the password only', pms.includes("const lim=adminMode==='limited'&&!consoleLike;") && pms.includes("r.tokens.lim=1;this.write(r.tokens)") && pms.includes("hostRole()==='console')"));
T('PMS: after the Authenticator the device is trusted (14 days)', pms.includes('await this.trustDevice(t2);') && pms.includes("action:'trust_device'"));
T('PMS: a limited admin cannot save: no push, no number blocks, no first copy, no platform settings, a note says so', pms.includes("if((MahaAuth.isLimited&&MahaAuth.isLimited()))return {pushed:0,conflicts:[]};") && pms.includes('async ensureLeases(force){\n    if((MahaAuth.isLimited&&MahaAuth.isLimited()))return;') && pms.includes('async firstCopy(){\n    if((MahaAuth.isLimited&&MahaAuth.isLimited()))return false;') && pms.includes('||(MahaAuth.isLimited&&MahaAuth.isLimited()))return;') && pms.includes('limNote();return}'));
T('PMS: the limited flag stays with the session after a refresh and a reload, and a strip tells the admin', pms.includes('if(t.lim)n.lim=1;') && pms.includes("id='limBadge'") && pms.includes('try{limBadge()}catch(e){}'));
T('PMS: buttons - Reset Authenticator (Admin team, Master) and Forget my trusted devices (My profile)', pms.includes('data-ra="${esc(a.username)}">Reset Authenticator</button>') && pms.includes("action:'admin_reset_mfa'") && pms.includes('id="pfForget">Forget my trusted devices</button>') && pms.includes("action:'forget_my_devices'"));
T('PMS: an admin may sign in on a system address (no refusal any more)', !pms.includes('The provider signs in at console.maha-hub.com, not on this address'));

/* ---- CRM, Billing and the shared Authenticator step ---- */
T('shared step: QR first on the first time, then the 6-digit code checked inside the pop-up (a right code plays the fireworks, a wrong one shakes the boxes); the browser is trusted afterwards',
  shared.includes("factor_type: 'totp'") && shared.includes("ask(pending ? 'enrol' : 'verify'") && shared.includes('MahaOtp.attach(input') && shared.includes("action: 'trust_device'") && shared.includes('otp.error(') && shared.includes('otp.win()'));
T('CRM and Billing load the shared step and run it when the answer says needs_mfa', crm.includes('maha-admin-mfa.js') && crm.includes("d.admin_mode === 'needs_mfa'") && bill.includes('maha-admin-mfa.js') && bill.includes("d.admin_mode==='needs_mfa'"));
T('one device id for every Maha address of the browser (a cookie on .maha-hub.com), so the Authenticator is asked once for the browser and not once for each address: PMS, CRM and Billing all read and write it',
  [pms, crm, bill].every(s => s.includes("maha_dev=") && s.includes('Domain=.maha-hub.com') && s.includes('SameSite=Lax')) && bill.includes("localStorage.setItem('maha.deviceId'"));
T('the trust step cuts the word Bearer off the token (a missing backslash once made the device never trusted)', ua.includes('.replace(/^Bearer\\s+/i, "")') && !/Bearers\+/.test(ua));
/* the PMS id really is shared: a cookie of another address wins, a new id is written to the cookie */
{
  const a = pms.indexOf('  deviceId(){'), b = pms.indexOf('  codeMsg(e){', a);
  const code = pms.slice(a, b).replace(/,\s*$/, '');
  const mk = (cookie, ls) => { const st = { cookie, ls: Object.assign({}, ls), host: 'crm.maha-hub.com' };
    const O = new Function('document', 'location', 'localStorage', 'crypto', 'btoa', 'return {' + code + '};')(
      { get cookie() { return st.cookie; }, set cookie(v) { st.cookie = (st.cookie ? st.cookie + '; ' : '') + String(v).split(';')[0]; } }, { hostname: st.host },
      { getItem: k => (k in st.ls ? st.ls[k] : null), setItem: (k, v) => { st.ls[k] = String(v); } }, { getRandomValues: x => { for (let n = 0; n < x.length; n++) x[n] = n * 7 + 3; return x; } }, s => Buffer.from(s, 'binary').toString('base64'));
    return { O, st }; };
  const A = mk('maha_dev=ABCDEFGHIJKLMNOPQRSTUVWX1234', { 'maha.deviceId': 'localldlocalldlocalldlocalld12' });
  T('a cookie from another Maha address wins over the id kept in this address', A.O.deviceId() === 'ABCDEFGHIJKLMNOPQRSTUVWX1234' && A.st.ls['maha.deviceId'] === 'ABCDEFGHIJKLMNOPQRSTUVWX1234');
  const B = mk('', { 'maha.deviceId': 'localldlocalldlocalldlocalld12' });
  const idB = B.O.deviceId();
  T('without a cookie the id of this address is kept and written to the cookie for the other addresses', idB === 'localldlocalldlocalldlocalld12' && /maha_dev=localldlocalldlocalldlocalld12/.test(B.st.cookie) && B.O.deviceId() === idB);
}
T('a person signed out while the page is loading (ended subscription) never gets a blank page: renderShell stops when there is no session', pms.includes('function renderShell(){' + String.fromCharCode(10) + '  if(SEL_ON)return;' + String.fromCharCode(10) + '  if(!DB||!DB.session)return;'));
T('an ended subscription: signed in, only the Subscription ended page, no automatic sign-out, and it opens by itself once extended', pms.includes('if(subStopped(h)){SUB_BLOCK=true;subBlockScreen(h);return}') && pms.includes('if(hh&&!subStopped(hh)){clearInterval(wait);SUB_BLOCK=false;location.reload()}'));
T('the session check (every few seconds) keeps the session while the Subscription ended page shows, so "Your session ended" no longer appears', pms.includes('accessWhy(u)||(subStopped(h)&&!SUB_BLOCK))return false;') && pms.includes('var SUB_BLOCK=false;'));
T('an admin on the PMS address passes the Authenticator in the same Maha pop-up as CRM and Billing (QR code the first time, six digit boxes); the Console keeps its own box; hotel users are not touched',
  pms.includes('<script src="/brand/maha/maha-admin-mfa.js"></script>') && pms.includes('(!consoleLike&&window.MahaAdminMfa)?await this.adminMfaPopup(r.tokens):await this.providerMfa(r.tokens)') && shared.includes('Set up two-step sign-in') && shared.includes('MAHA HUB') && shared.includes('#eceff0') && shared.includes('Inter,"Noto Sans"') && shared.includes('Copy'));
T('an admin signing in on the PMS address lands in a hotel PMS like a hotel user (one hotel straight in, several a short list with search), not on the provider pages; leaving the hotel returns to that list', pms.includes('enterProvider(un,r.userId,pmsAddr())') && pms.includes('function pmsHotelLand(un)') && pms.includes("if(land){pmsHotelLand(un);return}") && pms.includes("m=modal('Choose a hotel'") && pms.includes("if(pmsAddr()){pmsHotelLand(user().username||'')}"));
const otpjs = fs.readFileSync(path.join(root, 'brand/maha/maha-otp.js'), 'utf8').replace(/\r\n/g, '\n');
T('every code in every system uses the same six boxes (Maha OTP): a digit pops in with a sparkle, the sixth plays the wave and fireworks, a wrong code shakes the boxes red; someone who reduces motion only sees colours',
  otpjs.includes('MahaOtp = {') && otpjs.includes('attach: function (input, opts)') && otpjs.includes('moPop') && otpjs.includes('moShake') && otpjs.includes('moWave') && otpjs.includes('function fireworks(row)') && otpjs.includes('prefers-reduced-motion: reduce') && otpjs.includes("input.type = 'hidden'") && otpjs.includes("autocomplete = i === 0 ? 'one-time-code'"));
T('the boxes are in the Authenticator pop-up (all systems), the PMS Console box, the PMS emailed device code, the CRM and Billing emailed code', [pms, crm, bill].every(s => s.includes('<script src="/brand/maha/maha-otp.js"></script>')) && shared.includes('MahaOtp.attach(input') && pms.includes("window.MahaOtp.attach($('#emCode',m)") && pms.includes("window.MahaOtp.attach($('#mfaCode',m)") && crm.includes("window.MahaOtp.attach(el.querySelector('#auC')") && bill.includes("window.MahaOtp.attach($('#c')"));
T('a right emailed code plays the fireworks and a wrong one shakes the boxes in the PMS (the pop-up checks the code itself); the checks of six digits are kept', pms.includes('emOtp.win()') && pms.includes("emOtp.error((r&&r.msg)||'That code is not correct.')") && pms.includes('mfaOtp.win()') && pms.includes('mfaOtp.error(') && pms.includes("{ok:true,value:x,quiet:pre.r.kind!=='ok'}"));
process.exit(fails ? 1 : 0);
