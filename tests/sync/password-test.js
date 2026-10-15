/* New password rule: at least 6 characters with one capital letter, one small letter, one special character and two numbers.
   Passwords made before this keep working (the rule is only checked when a password is set). No network.
   node tests/sync/password-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };

/* the app's own check (provider profile) */
const a = app.indexOf('function pwProblem('), b = app.indexOf('\n', a);
const appCheck = new Function(app.slice(a, b) + '\nreturn pwProblem;')();
/* the website password page (set-password link from the email) */
const script = fs.readFileSync(path.join(root, 'website', 'content', 'reset-password.script.html'), 'utf8');
const s = script.indexOf('function passwordProblem(pw)'), e = script.indexOf('function flag(');
const pageCheck = username => new Function('username', script.slice(s, e) + '\nreturn passwordProblem;')(username);

const both = (name, pw, ok, un) => {
  const p1 = appCheck(pw, un), p2 = pageCheck(un || '')(pw);
  T(name + ': ' + JSON.stringify(pw) + (ok ? ' accepted' : ' refused'), ok ? (p1 === '' && p2 === '') : (p1 !== '' && p2 !== ''), ok ? (p1 || p2) : '');
};
/* accepted */
both('has all four things, shortest form', 'Ab1!x2', true);
both('normal password', 'Hotel#2026', true);
both('long passphrase', 'My Hotel Is Great! 2026 99', true);
both('two numbers not next to each other', 'Pa$sw0rd9', true);
both('any special character counts', 'Abc~12', true);
/* refused */
both('no capital letter', 'abcd12!x', false);
both('no small letter', 'ABCD12!X', false);
both('no special character', 'Abcd1234', false);
both('only one number', 'Abcde1!x', false);
both('no number at all', 'Abcdef!x', false);
both('too short (5 characters)', 'Ab1!2', false);
both('a space is not a special character', 'Ab 1 2', false);
both('old rule password (10+ letters and numbers) is not enough for a NEW one', 'Hotel12345', false);
both('contains the username', 'Frontdesk#12A', false, 'frontdesk');
both('the starting password', 'Maha@2026', false);
/* the messages say what is missing, in plain words */
T('the message lists what to add', /capital letter/.test(appCheck('abc', '')) === false && appCheck('abcdefgh', '') === 'Add one capital letter, one special character, for example ! @ # $ %, two numbers.');
T('the website page gives the same message', pageCheck('')('abcdefgh') === 'Add one capital letter, one special character, for example ! @ # $ %, two numbers.');
/* old passwords are not touched: the check is used when a password is set, never at sign-in */
T('the rule is checked in exactly one place of the app (saving a new password)', (app.match(/pwProblem\(/g) || []).length === 2);
const signIn = app.slice(app.indexOf('async signIn(username,password)'), app.indexOf('async codeStep('));
T('sign-in does not apply the rule, so existing passwords keep working', !/pwProblem|passwordProblem/.test(signIn));
/* the texts people read */
const page = fs.readFileSync(path.join(root, 'reset-password.html'), 'utf8');
T('the password page tells the new rule', /6 characters, with one capital letter, one small letter, one special character and two numbers/.test(page) && !/10 characters/.test(page));
T('the profile page tells the new rule and that the current password keeps working', /At least 6 characters with one capital letter, one small letter, one special character/.test(app) && /keeps working until you change it/.test(app) && !/At least 10 characters/.test(app));
process.exit(fails ? 1 : 0);
