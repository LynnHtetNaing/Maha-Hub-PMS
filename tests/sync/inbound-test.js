/* A hotel writes back: crm-inbound keeps what the hotel wrote under Enewletter > Replies.
     node tests/sync/inbound-test.js crm/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const crm = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const fn = rd('supabase/functions/crm-inbound/index.ts'), wk = rd('workers/crm-inbound/index.js'), wt = rd('workers/crm-inbound/wrangler.toml');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

const a = fn.indexOf('export const trimReply'), b = fn.indexOf('const handle = async');
const code = fn.slice(a, b).replace(/export const /g, 'const ').replace(/: (string|\{ key: string; value: string \}\[\]|boolean)(?=[,)\s=])/g, '').replace(/ as [A-Za-z\[\]{}:;, ]+(?=[;,)])/g, '').replace(/: string\[\]/g, '');
const { trimReply, isAutomatic } = new Function(code + '\nreturn { trimReply, isAutomatic };')();

T('only the new text is kept: the quoted old mail ("> ...", "On ... wrote:", Original Message, Sent from my phone) is cut',
  trimReply('Yes, 10:00 is fine.\nThanks\n\nOn Thu, 5 Nov 2026 at 09:00, Maha Hub <crm@maha-hub.com> wrote:\n> old text') === 'Yes, 10:00 is fine.\nThanks'
  && trimReply('OK\n\n-----Original Message-----\nFrom: x') === 'OK' && trimReply('Call me\nSent from my iPhone\nold') === 'Call me' && trimReply('> only quoted') === '');
T('automatic mail is skipped (auto replies, bounces, bulk, our own address)', isAutomatic('a@b.com', 'Re: x', [{ key: 'Auto-Submitted', value: 'auto-replied' }]) === true
  && isAutomatic('mailer-daemon@x.com', 'Undelivered', []) === true && isAutomatic('a@b.com', 'Automatic reply: away', []) === true
  && isAutomatic('a@b.com', 'x', [{ key: 'Precedence', value: 'bulk' }]) === true && isAutomatic('crm@maha-hub.com', 'x', []) === true
  && isAutomatic('hotel@x.com', 'Re: News', [{ key: 'Auto-Submitted', value: 'no' }]) === false);
T('the function needs the secret (at least 16 characters) and checks it in constant time; a second delivery changes nothing; it keeps a reply record from email', fn.includes('SECRET.length < 16') && fn.includes('const same = ') && fn.includes('ignoreDuplicates: true') && fn.includes('source: "email"') && fn.includes('kind: "reply"'));
T('the hotel is found by its email, else by a contact email of its follow ups or meetings', fn.includes('"data->>email", "ilike"') && fn.includes('"data->>contactEmail", "ilike"'));
T('Email Worker: passes the raw mail to the function with the secret and still forwards the mail to the mailbox; no secret in the files', wk.includes("'x-inbound-secret': env.INBOUND_SECRET") && wk.includes('message.forward(env.FORWARD_TO)') && !/INBOUND_SECRET\s*=\s*"/.test(wt) && wt.includes('crm-inbound'));
T('CRM: a reply row opens the whole reply (who, what, when, the message) with Open hotel; written replies say Wrote back', crm.includes('data-act="replyView"') && crm.includes('replyView: el => {') && crm.includes('Open hotel</a>') && fn.includes('label: "Wrote back"'));
process.exit(fails ? 1 : 0);
