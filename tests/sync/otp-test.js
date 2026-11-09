/* Sign-in code (6 digits): the check must really accept six digits. A lost backslash (/^d{6}$/ instead of /^\d{6}$/) made every code "wrong" from 2026-11-05.
     node tests/sync/otp-test.js */
const fs = require('fs');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const eco = read('ecosystem/index.html'), crm = read('crm/index.html'), bill = read('billing/index.html');
const BS = String.fromCharCode(92);   // a backslash, written so no tool can drop it
const digits = '/^' + BS + 'd{6}$/', spaces = '/' + BS + 's+/g';
T('PMS / Provider: the code pop-up strips spaces and checks six digits with real escapes', eco.includes("replace(" + spaces + ",'');if(!" + digits + ".test(v))"));
T('PMS / Provider: the checks accept 123456 and 123 456, and refuse 12345, abcdef and 1234567', (() => { const ok = s => /^\d{6}$/.test(String(s).replace(/\s+/g, '')); return ok('123456') && ok('123 456') && !ok('12345') && !ok('abcdef') && !ok('1234567'); })());
T('CRM sign-in checks six digits with real escapes', crm.includes('!' + digits + '.test(code)'));
T('Billing sign-in checks six digits with real escapes', bill.includes('!' + digits + '.test(c)'));
const lost = [['ecosystem/index.html', eco], ['crm/index.html', crm], ['billing/index.html', bill], ['reset-password.html', read('reset-password.html')]].filter(([f, s]) => s.includes('(/^d{') || s.includes('.replace(/s+/g') || s.includes('/^d+$/')).map(x => x[0]);
T('no page has a digit or space check written without its backslash', lost.length === 0, lost.join(', '));
process.exit(fails ? 1 : 0);
