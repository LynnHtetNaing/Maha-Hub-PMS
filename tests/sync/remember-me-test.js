/* Remember me: the app keeps only the username (and Property ID), never the password; when the box is ticked and a hotel sign-in worked, the browser's own
   password manager is asked to save the password so it can fill it next time.
     node tests/sync/remember-me-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };

const fn = cut('function offerSavePassword(', 'function doLogin(');
const run = (checked, un, pw, hasApi) => {
  const stored = [];
  const win = hasApi ? { PasswordCredential: function (o) { Object.assign(this, o); } } : {};
  const nav = hasApi ? { credentials: { store: c => { stored.push(c); return Promise.resolve(); } } } : {};
  new Function('document', 'window', 'navigator', 'PasswordCredential', fn + ';offerSavePassword(' + JSON.stringify(un) + ',' + JSON.stringify(pw) + ')')(
    { getElementById: () => checked === null ? null : { checked } }, win, nav, win.PasswordCredential);
  return stored;
};
let s = run(true, 'owner', 'secret', true);
T('Remember me ticked: the browser is asked to save the username and password', s.length === 1 && s[0].id === 'owner' && s[0].password === 'secret');
T('Remember me not ticked: nothing is offered', run(false, 'owner', 'secret', true).length === 0);
T('no password typed: nothing is offered', run(true, 'owner', '', true).length === 0);
T('a browser without the password API: nothing breaks', run(true, 'owner', 'secret', false).length === 0);

T('the app itself never keeps a password (only the username and the Property ID)', !/localStorage\.setItem\('maha\.remember(Pass|Password|Pw)/i.test(src) && src.includes("localStorage.setItem('maha.rememberUser',un)"));
T('the sign-in fields are named for the browser (username, password)', src.includes('<input id="lgUser" name="username" autocomplete="username"') && src.includes('<input id="lgPass" name="password" type="password" autocomplete="current-password"'));
T('offered after a hotel sign-in worked (cloud and local), not for provider accounts', src.includes('return}offerSavePassword(un,pw);staffEnter(r.h,r.u);') && src.includes('offerSavePassword(un,pw);staffEnter(h,u);') && cut('const want=lgTargetSys;enterProvider(', 'offerSavePassword(un,pw);staffEnter(r.h,r.u)').indexOf('offerSavePassword') < 0);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
