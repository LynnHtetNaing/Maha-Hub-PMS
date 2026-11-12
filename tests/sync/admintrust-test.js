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
T('shared step: QR first on the first time, then the 6-digit code; five tries; the device is trusted afterwards', shared.includes("factor_type: 'totp'") && shared.includes("ask(pending ? 'enrol' : 'verify'") && shared.includes('n >= 5') && shared.includes("action: 'trust_device'"));
T('CRM and Billing load the shared step and run it when the answer says needs_mfa', crm.includes('maha-admin-mfa.js') && crm.includes("d.admin_mode === 'needs_mfa'") && bill.includes('maha-admin-mfa.js') && bill.includes("d.admin_mode==='needs_mfa'"));
T('Billing keeps one device id (so the device can be remembered)', bill.includes("localStorage.setItem('maha.deviceId',n)"));
process.exit(fails ? 1 : 0);
