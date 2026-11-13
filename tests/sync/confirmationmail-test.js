/* The guest's booking confirmation mail (supabase/functions/_shared/confirmation-mail.ts), run for real.
     node tests/sync/confirmationmail-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
let strip = null; try { strip = require('node:module').stripTypeScriptTypes; } catch (e) { /* older Node */ }
if (!strip) { console.log('SKIP this Node cannot strip types'); process.exit(0); }
const pms = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const src = strip(fs.readFileSync(path.join(root, 'supabase/functions/_shared/confirmation-mail.ts'), 'utf8'), { mode: 'strip' }).replace(/^export /gm, '');
const { cleanConfirmation, confirmationMail, confirmationSubject, MAIL_LIMITS } = new Function(src + '\nreturn { cleanConfirmation, confirmationMail, confirmationSubject, MAIL_LIMITS };')();
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

const base = {
  hotel: { name: 'Sample Hotel', address: '1 Sample Road, Bangkok', phone: '+66 00 000 0000', email: 'hotel@sample.example' },
  guest: { name: 'Mr. Guest Sample' },
  booking: { no: '9486', confirmation: '9486', arrLabel: 'Friday, 13 November 2026', depLabel: 'Sunday, 15 November 2026', checkin: '14:00', checkout: '12:00', nights: '2 nights', roomType: 'Superior Twin', ratePlan: 'Room Only (RO)', pax: '2 adults' },
  money: { cur: 'THB', payStatus: 'Partially paid', rate: '1,762.50', roomTotal: '3,525.00', paid: '1,500.00', balance: '2,025.00' },
  policies: { cancel: 'Free until 11 Nov.', child: '', noshow: '', terms: '' },
  request: ['Late arrival', 'Quiet room'],
};
const mail = d => confirmationMail(cleanConfirmation(d));
const m = mail(base);

T('the greeting uses the title and the guest name, and the hotel name is in the mail but is not the sender', m.html.includes('Thanks, Mr. Guest Sample!') && m.html.includes('Sample Hotel') && /Maha Hub/.test(m.html) && /Please do not reply/.test(m.text));
T('phone and email of the hotel are both in the hotel card, with Directions and Email the hotel buttons', m.html.includes('+66 00 000 0000') && m.html.includes('hotel@sample.example') && m.html.includes('>Directions<') && m.html.includes('>Email the hotel<') && m.html.includes('google.com/maps/search'));
T('the nights are under Check-out and the room row is "Room Type" without the nights', /Check-out until 12:00[\s\S]{0,300}2 nights/.test(m.html) && m.html.includes('>Room Type<') && !m.html.includes('Your reservation'));
T('the price is: Rate per night, Total Room Nights, Total price', ((h) => h.indexOf('Rate per night') > 0 && h.indexOf('Total Room Nights') > h.indexOf('Rate per night') && h.indexOf('Total price') > h.indexOf('Total Room Nights'))(m.html));
T('partly paid shows Deposit Paid and Remaining Amount to Pay', m.html.includes('Deposit Paid') && m.html.includes('Remaining Amount to Pay') && !m.html.includes('>Amount Paid<'));
T('paid in full shows Amount Paid only', ((h) => h.includes('>Amount Paid<') && !h.includes('Remaining Amount') && !h.includes('Deposit Paid'))(mail({ ...base, money: { ...base.money, payStatus: 'Paid', paid: '3,525.00', balance: '0.00' } }).html));
T('pay at the hotel shows Pay to Hotel; collected by the booking channel shows no amount to pay',
  mail({ ...base, money: { ...base.money, payStatus: 'Pay at the hotel', paid: '0.00', balance: '3,525.00' } }).html.includes('Pay to Hotel') && /Collected by the booking channel/.test(mail({ ...base, money: { ...base.money, payStatus: 'OTA collect' } }).html) && !mail({ ...base, money: { ...base.money, payStatus: 'OTA collect' } }).html.includes('Remaining Amount'));
T('the four policy sections always show, with "-" when empty; the order puts Your Request just above the Terms and Conditions; there is no "Notes for your stay"',
  ['Cancellation Policy', 'Child Policy', 'No-show Policy', 'Terms and Conditions'].every(t => m.html.includes('>' + t + '<')) && ((h) => h.indexOf('>Your Request<') > h.indexOf('>No-show Policy<') && h.indexOf('>Your Request<') < h.indexOf('>Terms and Conditions<'))(m.html) && />-<\/div>/.test(m.html) && !m.html.includes('Notes for your stay'));
T('Your Request appears only when there is a request, as bullets', !mail({ ...base, request: [] }).html.includes('Your Request') && m.html.includes('<li style="margin:4px 0">Late arrival</li>'));
T('each text shows only the first lines: 5 for the policies, 8 for the terms, 6 requests',
  ((c) => c.policies.cancel.split('\n').length === 5 && c.policies.terms.split('\n').length === 8 && c.request.length === 6 && MAIL_LIMITS.cancel === 5 && MAIL_LIMITS.terms === 8)(cleanConfirmation({ ...base, policies: { cancel: Array.from({ length: 9 }, (_, i) => 'c' + i).join('\n'), child: '', noshow: '', terms: Array.from({ length: 20 }, (_, i) => 't' + i).join('\n') }, request: Array.from({ length: 10 }, (_, i) => 'r' + i) })));
T('nothing the browser sends can become markup', !mail({ ...base, guest: { name: '<script>alert(1)</script>' }, request: ['<img src=x onerror=1>'] }).html.match(/<script|<img src=x/));
T('the subject names the hotel', confirmationSubject(cleanConfirmation(base)) === 'Thanks! Your booking is confirmed at Sample Hotel');
T('the PMS: a new setup section "Guest mail policies" (provider only) holds the cancellation, child, no-show and terms texts, with the same line limits; the mail takes them from there',
  pms.includes("['mailpol','16','Guest mail policies']") && pms.includes('mailpol(box){') && pms.includes('s.mailPol={...out') && pms.includes('mp=s.mailPol||{}') && pms.includes("policies:{cancel,child:mp.child||'',noshow:mp.noshow||'',terms:mp.terms||''}") && /if\(!provOnly\(\)\)return;const out=\{\}/.test(pms));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
