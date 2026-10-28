/* Provider: Change email, Sign-in security panel, and the console tidy-ups.
     node tests/sync/changeemail-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const fnSrc = fs.readFileSync('supabase/functions/platform-admin-provision/index.ts', 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + 1); if (a < 0 || b < 0) throw new Error('not found: ' + from); return src.slice(a, b); };

(async () => {
  const block = cut('/* ---- Sign-in security', '/* ---- end Sign-in security ---- */');
  const S = new Function(block + '\nreturn SignInSec;')();

  /* both boxes must match and hold a valid address */
  for (const a of ['a@b.co', ' New.Desk@Example.Test ', 'x.y+z@mail.example.com']) T('valid address accepted: ' + a, S.emailOk(a));
  for (const a of ['', 'abc', 'a@b', 'a b@c.de', '@c.de', 'a@@c.de', null, 'a@b.' + 'x'.repeat(260)]) T('invalid address refused: ' + String(a).slice(0, 20), !S.emailOk(a));
  T('two equal addresses pass (case and spaces ignored)', S.check('A@b.co', ' a@B.co ') === '');
  T('two different addresses are refused with a plain sentence', /not the same/.test(S.check('a@b.co', 'c@d.co')));
  T('an invalid first address is refused', /valid email/.test(S.check('abc', 'abc')));
  T('an empty second box is refused', S.check('a@b.co', '') !== '');

  /* change: refuses without calling, otherwise calls the action exactly once and returns the masked address */
  let calls = [];
  const ok = async b => { calls.push(b); return { ok: true, masked_email: 'n***@example.test' }; };
  let r = await S.change(ok, 'HTL01', 'ce.desk', 'a@b.co', 'x@y.co');
  T('mismatch: nothing is sent', calls.length === 0 && !!r.error);
  r = await S.change(ok, 'HTL01', 'ce.desk', 'not-an-address', 'not-an-address');
  T('invalid address: nothing is sent', calls.length === 0 && !!r.error);
  r = await S.change(ok, 'HTL01', 'ce.desk', ' New.Desk@Example.Test ', 'new.desk@example.test');
  T('the action is called once with the person and the new address', calls.length === 1 && calls[0].action === 'change_staff_email' && calls[0].username === 'ce.desk' && calls[0].new_email === 'new.desk@example.test', JSON.stringify(calls));
  T('the masked new address comes back', r.ok === true && r.masked === 'n***@example.test');
  for (const [code, text] of [['email_taken', /already used/], ['invalid_email', /not a valid/], ['forbidden', /not allowed/], ['email_update_failed', /Nothing was changed/]]) {
    const bad = async () => { throw new Error(code) };
    const e = await S.change(bad, 'HTL01', 'ce.desk', 'a@b.co', 'a@b.co');
    T('a plain message for ' + code, text.test(e.error || ''), e.error);
  }

  /* the list and "Forget trusted devices" */
  calls = [];
  const list = async b => { calls.push(b); return { ok: true, staff: [{ username: 'ce.desk', masked_email: 'd***@example.test', last_verified_at: '2026-10-01T08:00:00Z' }] }; };
  const l1 = await S.load(list, 'HTL01', true);
  T('the list asks the server for the hotel once', calls.length === 1 && calls[0].action === 'staff_signin_list' && calls[0].property_code === 'HTL01');
  T('the list is kept, and found per person', l1.length === 1 && S.find('HTL01', 'ce.desk').masked_email === 'd***@example.test' && S.find('HTL01', 'zz') === null);
  await S.load(list, 'HTL01');
  T('a second look without force does not ask again', calls.length === 1);
  calls = [];
  r = await S.forget(ok, 'HTL01', 'ce.desk');
  T('Forget trusted devices calls the action once', r.ok === true && calls.length === 1 && calls[0].action === 'forget_devices' && calls[0].username === 'ce.desk');
  T('after a change or a reset the kept list is dropped', S.find('HTL01', 'ce.desk') === null);

  /* the window: runs the real dialog code with small stand-ins */
  const dlgSrc = cut('function signinEmailDialog', 'function signinPanel');
  const run = async (typedA, typedB) => {
    const els = { '#ceA': { value: typedA }, '#ceB': { value: typedB }, '#ceS': { disabled: false }, '#ceE': { textContent: '' } };
    let html = '', toasts = [], closed = 0, called = [], logs = [], after = 0, handler = null;
    const m = {};
    Object.defineProperty(els['#ceS'], 'onclick', { set(f) { handler = f; }, get() { return handler; } });
    const env = {
      SignInSec: new Function(block + '\nreturn SignInSec;')(),
      ProvAdmin: { call: async b => { called.push(b); return { ok: true, masked_email: 'n***@example.test' }; } },
      modal: (t, h) => { html = t + '\n' + h; return m; }, $: (s) => els[s], fld: (l, i) => l + i, esc: s => String(s),
      closeModal: () => { closed++; }, toast: t => toasts.push(t), provLog: t => logs.push(t), saveDB: () => {}
    };
    env.SignInSec.cache.HTL01 = [{ username: 'ce.desk', masked_email: 'd***@example.test' }];
    const open = new Function(...Object.keys(env), dlgSrc + '\nreturn signinEmailDialog;')(...Object.values(env));
    open('HTL01', 'ce.desk', () => { after++; });
    await handler();
    return { html, toasts, closed, called, logs, after, err: els['#ceE'].textContent };
  };
  let w = await run('new.desk@example.test', 'new.desk@example.test');
  T('the window shows the current address masked', /d\*\*\*@example\.test/.test(w.html));
  T('the window says in plain words where the emails go and that a new code is asked', /sign-in code and password-reset emails will go to the new address\. This person will be asked for a new code on every device\./.test(w.html));
  T('the window has two address boxes', /New email<input id="ceA"/.test(w.html) && /New email again<input id="ceB"/.test(w.html));
  T('Save calls the action once, closes, and shows the masked result', w.called.length === 1 && w.closed === 1 && w.after === 1 && w.toasts.some(t => /n\*\*\*@example\.test/.test(t)), JSON.stringify(w.toasts));
  T('the full new address is not put in the page log', w.logs.length === 1 && !/new\.desk/.test(w.logs[0]));
  w = await run('new.desk@example.test', 'other@example.test');
  T('two different addresses: nothing is sent and the window stays open', w.called.length === 0 && w.closed === 0 && /not the same/.test(w.err));

  /* where the buttons are */
  const perms = cut("const PP={q:", "VIEWS['prov.amend']"), page = perms.slice(perms.indexOf('function usersPage('));
  const guard = page.indexOf('DB.session.provider'), btn = perms.indexOf('data-ce=');
  T('Staff & permissions is only for the provider, and the page checks that first', page.indexOf('prov')>=0 && page.indexOf('DB.session.provider')>0 && page.indexOf('DB.session.provider')<200 && btn > 0);
  T('the Change email button only shows with the cloud sign-in on', /MahaAuth\.on\(\)\?'[^]{0,300}data-ce=/.test(perms));
  T('the popup shows the masked address as a small grey line', /Email: <b data-em=/.test(perms) && /masked_email/.test(perms));
  T('the page never asks for a table directly (only the provider function)', !/\.from\('maha_trusted_devices'\)|\.from\('maha_login_identities'\)/.test(src));
  const sec = cut("VIEWS['prov.security']=el=>{", 'let _idle,_sessTouch');
  T('the Security Center has the sign-in panel', /id="siBox"/.test(sec) && /signinPanel\(/.test(sec));
  const panel = cut('function signinPanel', 'function enterProvider');
  T('the panel explains the code rule in one plain sentence', /On a new device, and again every 30 days, a 6-digit code is emailed to the person\./.test(panel));
  T('the panel lists last code check, Forget trusted devices and Change email', /Last code check/.test(panel) && /Forget trusted devices/.test(panel) && /Change email/.test(panel) && /signinEmailDialog\(/.test(panel));

  /* the Systems page and the one name */
  const systems = cut("VIEWS['prov.systems']=el=>{", "VIEWS['prov.google']");
  T('no developer commands anywhere in the page', !/server\.mjs|port 878/.test(src));
  T('the Systems page keeps the server address boxes', /id="cxHost"/.test(systems) && /id="bkHost"/.test(systems));
  T('the name Provider history is gone', !/provider history/i.test(src));
  T('the console menu and the hotel menu both say Amendment log', (src.match(/\['Amendment log','prov\.log'\]/g) || []).length === 2);
  T('the page itself is called Amendment log', /pageHead\('Amendment log'/.test(src) && !/Amendment Log/.test(src));

  /* the server function: provider gate comes first, and the email never reaches the log */
  const gate = fnSrc.indexOf('maha_platform_admins'), act = fnSrc.indexOf('action === "change_staff_email"');
  T('the new actions sit behind the provider and two-step checks', gate > 0 && act > gate && fnSrc.indexOf('mfa_required') < act);
  T('the new actions use the database functions and the Auth update', /maha_change_staff_email/.test(fnSrc) && /updateUserById\(done\.user_id, \{ email: newEmail, email_confirm: true \}/.test(fnSrc) && /maha_reset_trusted_devices/.test(fnSrc));
  const respondBlock = fnSrc.slice(fnSrc.indexOf('const respond ='), fnSrc.indexOf('let mailError'));
  T('the activity log never receives an email address', !/new_email|masked_email|recovery_email/.test(respondBlock));

  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
