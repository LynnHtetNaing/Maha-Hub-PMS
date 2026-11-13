/* The PMS Mail button: the confirmation is sent to the guest through Maha Mail by the pms-send-mail function, in the hotel's name.
     node tests/sync/pmssendmail-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const pms = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const fn = rd('supabase/functions/pms-send-mail/index.ts'), sql = rd('supabase/migrations/20261113_043_pms_mail_log.sql'), wf = rd('.github/workflows/tenant-cloud-storage-tests.yml');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('the function needs a signed-in person who may write to that hotel (the same rule as the PMS cloud), and an unknown hotel looks like a forbidden one',
  fn.includes('auth.getUser(') && fn.includes('maha_can_write_property') && fn.includes('from("maha_properties")') && fn.includes('property_access_denied'));
T('one guest address per call, a clean subject and text, no attachment, no link of our own', fn.includes('validEmail(to)') && !/attachments*[:=[]/.test(fn) && !/https:\/\/crm\.maha-hub\.com\/r\//.test(fn));
T('the mail is a no-reply mail from the Maha Hub brand: no hotel name or hotel address as the sender, and no reply address', fn.includes('"PMS_MAIL_FROM_NAME") || "Maha Hub"') && fn.includes('noreply@maha-hub.com') && !/replyTo/.test(fn) && !/sender: \{ name: hotel/.test(fn));
T('a person is limited to 40 mails an hour, and every send is recorded', fn.includes('HOURLY_LIMIT = 40') && fn.includes('too_many') && fn.includes('from("maha_pms_mail_log").insert'));
T('the key and the addresses never go to the log', !/console\.(log|error|warn)/.test(fn));
T('the log table is private: only the hotel people read their own rows, only the server writes', /revoke all on public\.maha_pms_mail_log from public, anon, authenticated/.test(sql) && /grant select on public\.maha_pms_mail_log to authenticated/.test(sql) && sql.includes('maha_can_access_property(property_id)') && sql.includes('enable row level security'));
T('the migration runs in the GitHub database test', wf.includes('20261113_043_pms_mail_log.sql'));
T('the Mail button of the booking panel sends at once (no box to fill in): a loading state while sending, then a success note',
  pms.includes('w.querySelector(\'#bkpMl\').onclick=e=>bkpMail(B,e.currentTarget)') && pms.includes("'<span class=\"spin\"></span> Sending...'") && pms.includes("'/functions/v1/pms-send-mail'") && pms.includes("centerNote('Confirmation sent successfully to '"));
T('a sent mail is written in the booking history; a refusal, or a booking with no guest email, is shown in words',
  pms.includes("histB(B,'Confirmation emailed to '+to)") && pms.includes('BKP_MAIL_ERR') && pms.includes('No guest email on file'));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
