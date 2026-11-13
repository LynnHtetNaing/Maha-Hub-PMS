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
  terms: ['Cancellation: free until 11 Nov.', 'No-show: one night charged.'].join('\n'),
  request: ['Late arrival', 'Quiet room'],
};
const mail = d => confirmationMail(cleanConfirmation(d));
const m = mail(base);

T('the greeting uses the title and the guest name, and the hotel name is in the mail but is not the sender', m.html.includes('Thanks, Mr. Guest Sample!') && m.html.includes('Sample Hotel') && /Maha Hub/.test(m.html) && /Please do not reply/.test(m.text));
T('the address is one line across the hotel card (not squeezed beside another box), and the confirmation number is not in the hotel card', ((h) => { const card = h.slice(h.indexOf('>Address<') - 140, h.indexOf('>Phone<') > 0 ? h.indexOf('>Phone<') : h.length); return /margin-top:14px[^>]*>Address<\/div><div style="font-weight:bold">1 Sample Road, Bangkok<\/div>/.test(h) && !/Confirmation number[\s\S]{0,60}9486[\s\S]*Reservation details/.test(h.slice(0, h.indexOf('Reservation details'))) && card.length > 0; })(m.html));
T('the confirmation number shows in the details only when it differs from the reservation number', !m.html.includes('>Confirmation number<') && mail({ ...base, booking: { ...base.booking, confirmation: 'ABC123' } }).html.includes('>Confirmation number<'));
T('phone and email of the hotel are both in the hotel card, with Directions and Email the hotel buttons', m.html.includes('+66 00 000 0000') && m.html.includes('hotel@sample.example') && m.html.includes('>Directions<') && m.html.includes('>Email the hotel<') && m.html.includes('google.com/maps/search'));
T('the nights are under Check-out and the room row is "Room Type" without the nights', /Check-out until 12:00[\s\S]{0,300}2 nights/.test(m.html) && m.html.includes('>Room Type<') && !m.html.includes('Your reservation'));
T('the price is: Rate per night, Total Room Nights, Total price', ((h) => h.indexOf('Rate per night') > 0 && h.indexOf('Total Room Nights') > h.indexOf('Rate per night') && h.indexOf('Total price') > h.indexOf('Total Room Nights'))(m.html));
T('partly paid shows Deposit Paid and Remaining Amount to Pay', m.html.includes('Deposit Paid') && m.html.includes('Remaining Amount to Pay') && !m.html.includes('>Amount Paid<'));
T('paid in full shows Amount Paid only', ((h) => h.includes('>Amount Paid<') && !h.includes('Remaining Amount') && !h.includes('Deposit Paid'))(mail({ ...base, money: { ...base.money, payStatus: 'Paid', paid: '3,525.00', balance: '0.00' } }).html));
T('pay at the hotel shows Pay to Hotel; collected by the booking channel shows no amount to pay',
  mail({ ...base, money: { ...base.money, payStatus: 'Pay at the hotel', paid: '0.00', balance: '3,525.00' } }).html.includes('Pay to Hotel') && /Collected by the booking channel/.test(mail({ ...base, money: { ...base.money, payStatus: 'OTA collect' } }).html) && !mail({ ...base, money: { ...base.money, payStatus: 'OTA collect' } }).html.includes('Remaining Amount'));
T('the payment status is plain text like the other lines (no corner tag)', ((h) => /Payment status<\/td><td[^>]*>Partially paid<\/td>/.test(h) && !/border-radius:999px/.test(h.slice(h.indexOf('Price and payment'), h.indexOf('Terms and Conditions'))))(m.html));
T('there is one policy title, Terms and Conditions: each term on its own line with a dash, and "-" when none is set; the old Cancellation / Child / No-show titles are gone',
  m.html.includes('>Terms and Conditions<') && m.html.includes('- Cancellation: free until 11 Nov.') && m.html.includes('- No-show: one night charged.') && !/>(Cancellation|Child|No-show) Policy</.test(m.html) && /Terms and Conditions[\s\S]*>-<\/div>/.test(mail({ ...base, terms: '' }).html) && m.text.includes('- Cancellation: free until 11 Nov.'));
T('Your Request sits just above the Terms and Conditions, only when there is a request, as bullets; there is no "Notes for your stay"',
  ((h) => h.indexOf('>Your Request<') > 0 && h.indexOf('>Your Request<') < h.indexOf('>Terms and Conditions<'))(m.html) && !mail({ ...base, request: [] }).html.includes('Your Request') && m.html.includes('<li style="margin:4px 0">Late arrival</li>') && !m.html.includes('Notes for your stay'));
T('every title is a bordered table box', (m.html.match(/border:1px solid #d3dcd8;border-radius:12px/g) || []).length >= 4);
T('each text shows only the first lines: 12 terms, 6 requests', ((c) => c.terms.split('\n').length === 12 && c.request.length === 6 && MAIL_LIMITS.terms === 12)(cleanConfirmation({ ...base, terms: Array.from({ length: 20 }, (_, i) => 't' + i).join('\n'), request: Array.from({ length: 10 }, (_, i) => 'r' + i) })));
T('nothing the browser sends can become markup', !mail({ ...base, guest: { name: '<script>alert(1)</script>' }, request: ['<img src=x onerror=1>'], terms: '<b>x</b>' }).html.match(/<script|<img src=x|<b>x/));
T('the subject names the hotel', confirmationSubject(cleanConfirmation(base)) === 'Thanks! Your booking is confirmed at Sample Hotel');
T('the PMS: setup section "Guest mail policies" (provider only) holds one box of terms and conditions with the same line limit; the mail takes it from there',
  pms.includes("['mailpol','16','Booking confirmation mail']") && pms.includes('mailpol(box){') && pms.includes('s.mailPol={terms:ls.join(') && pms.includes('mp=s.mailPol||{}') && pms.includes("terms:mp.terms||''") && /if\(!provOnly\(\)\)return;const ls=/.test(pms) && !pms.includes('mp.noshow'));
T('the Reservation number is the OTA reservation number for an OTA booking (an agency company) and the hotel confirmation number for a Direct booking', pms.includes("return d.co&&d.co.type==='T'&&ota?ota:hotelNo") && pms.includes('booking:{no:refNo,confirmation:refNo,'));
T('the printed confirmation has the Tax Invoice look (hotel head with logo), the same sections and wording as the mail, the full price breakdown from the hotel service charge and VAT, the signature boxes; the old letter template is gone', pms.includes('function confirmationPrintHtml(B)') && pms.includes('${hotelHead()}<div class="ivtitle">BOOKING CONFIRMATION') && pms.includes('Room charge before service charge and VAT') && pms.includes("'Service Charge '+sv+'%'") && pms.includes("'VAT '+vt+'%'") && pms.includes('Hotel stamp and signature') && !pms.includes('confirmTpl') && !pms.includes('function confirmationLetter'));
T('the Mail button of the reservation screen and of the panel open the same Maha Mail box', pms.includes("q('#aMail').onclick=()=>bkpMail(B)") && pms.includes("w.querySelector('#bkpMl').onclick=()=>bkpMail(B)"));
T('the automatic mail is a hotel preference, off by default, and only for a confirmed Direct reservation (company DIR) that has a guest email; OTA and walk-in bookings are sent by hand', pms.includes('H.set.autoConfirmMail!==true') && pms.includes("co.code!=='DIR'") && pms.includes('if(!walkin)autoConfirmMail(B);') && pms.includes("s.autoConfirmMail=!!$('#mp_auto',box).checked") &&pms.includes('Send the confirmation mail automatically when a <b>Direct reservation</b> is made (off by default)'));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
