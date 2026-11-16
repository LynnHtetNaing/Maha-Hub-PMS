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
  booking: { no: '9486', confirmation: '9486', arrLabel: 'Friday, 13 November 2026', depLabel: 'Sunday, 15 November 2026', checkin: '14:00', checkout: '12:00', nights: '2 nights', roomType: 'Superior Twin', ratePlan: 'Room Only (RO)', pax: '2 adults', channel: 'Agoda' },
  money: { cur: 'THB', payStatus: 'Partially paid', rate: '1,762.50', roomTotal: '3,525.00', paid: '1,500.00', balance: '2,025.00' },
  boxes: [{ title: 'Cancellation Policy', text: 'Free until 11 Nov.' }, { title: 'No-show Policy', text: 'One night charged.' }],
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
T('the provider\'s own titled boxes each become their own section, bullets not dashes, in the order given',
  m.html.includes('>Cancellation Policy<') && m.html.includes('>No-show Policy<') && m.html.includes('<li style="margin:3px 0">Free until 11 Nov.</li>') && m.html.includes('<li style="margin:3px 0">One night charged.</li>') && m.html.indexOf('>Cancellation Policy<') < m.html.indexOf('>No-show Policy<') && m.text.includes('- Free until 11 Nov.'));
T('a box with no text still shows, with a single dash', mail({ ...base, boxes: [{ title: 'Pet Policy', text: '' }] }).html.includes('>Pet Policy<') && /Pet Policy[\s\S]*<li style="margin:3px 0"><\/li>/.test(mail({ ...base, boxes: [{ title: 'Pet Policy', text: '' }] }).html));
T('Your Request sits just above the first box, only when there is a request, as bullets; there is no "Notes for your stay"',
  ((h) => h.indexOf('>Your Request<') > 0 && h.indexOf('>Your Request<') < h.indexOf('>Cancellation Policy<'))(m.html) && !mail({ ...base, request: [] }).html.includes('Your Request') && m.html.includes('<li style="margin:4px 0">Late arrival</li>') && !m.html.includes('Notes for your stay'));
T('every title is a bordered table box', (m.html.match(/border:1px solid #d3dcd8;border-radius:12px/g) || []).length >= 4);
T('Channel shows in Reservation details', m.html.includes('>Channel<') && /Channel<\/td><td[^>]*>Agoda<\/td>/.test(m.html));
T('each text shows only the first lines, boxes and requests are capped: 12 lines, 8 boxes, 6 requests',
  ((c) => c.boxes[0].text.split('\n').length === 12 && c.boxes.length === 8 && c.request.length === 6 && MAIL_LIMITS.lines === 12 && MAIL_LIMITS.boxes === 8)(cleanConfirmation({ ...base, boxes: Array.from({ length: 12 }, (_, i) => ({ title: 'Box ' + i, text: Array.from({ length: 20 }, (_, j) => 't' + j).join('\n') })), request: Array.from({ length: 10 }, (_, i) => 'r' + i) })));
T('nothing the browser sends can become markup', !mail({ ...base, guest: { name: '<script>alert(1)</script>' }, request: ['<img src=x onerror=1>'], boxes: [{ title: '<b>x</b>', text: '<b>x</b>' }] }).html.match(/<script|<img src=x|<b>x/));
T('the subject names the hotel', confirmationSubject(cleanConfirmation(base)) === 'Thanks! Your booking is confirmed at Sample Hotel');
T('the PMS: setup section "Guest mail policies" (provider only) lets the provider add, title and remove as many policy boxes as they like, each with its own bulleted lines, the same per-box line limit as the mail',
  pms.includes('mailpol(box){') && pms.includes("boxes.push({title:'',text:''})") && pms.includes('data-bxdel') && pms.includes('data-bxt=') && pms.includes('data-bxx=') && pms.includes('s.mailPol={boxes:clean') && pms.includes('mp=s.mailPol||{}') && pms.includes('function bkpBoxes(mp)') && /if\(!provOnly\(\)\)return;\s*\n\s*const clean=/.test(pms));
T('the Reservation number is the OTA reservation number for an OTA booking (an agency company) and the hotel confirmation number for a Direct booking', pms.includes("return d.co&&d.co.type==='T'&&ota?ota:hotelNo") && pms.includes('booking:{no:refNo,confirmation:refNo,'));
T('the printed confirmation has the Tax Invoice look (hotel head with logo), the full price breakdown from the hotel service charge and VAT, a thank-you closing signed by the hotel team (no signature boxes), Channel in Reservation details; the old letter template is gone',
  pms.includes('function confirmationPrintHtml(B)') && pms.includes('${hotelHead()}<div class="ivtitlebar"><div class="ivtitle">BOOKING CONFIRMATION') && pms.includes("['Channel',bk.channel]") && pms.includes('Room charge before service charge and VAT') && pms.includes("'Service Charge '+sv+'%'") && pms.includes("'VAT '+vt+'%'") && pms.includes('cfclose') && pms.includes('${esc(H.set.name)} Team') && !pms.includes('Guest signature') && !pms.includes('Hotel stamp and signature') && !pms.includes('confirmTpl') && !pms.includes('function confirmationLetter'));
T('the printed confirmation is two pages: page 1 has Reservation details, Price and payment and Your Request; page 2 repeats the full hotel header and has one bordered box per policy title, a closing and the Maha footer on both pages',
  pms.includes("const page1=`<div class=\"ppage port inv cf\"><div class=\"a4in\">${hotelHead()}") && pms.includes("const page2=`<div class=\"ppage port inv cf\"><div class=\"a4in\">${hotelHead()}") && pms.includes('BOOKING CONFIRMATION (continued)') && pms.includes('return page1+page2') && pms.includes('function cffoot()') && (pms.match(/\$\{cffoot\(\)\}/g) || []).length >= 2);
T('the value column uses its own class, never the bare class "v" - that name is already used elsewhere for a 22px dashboard number and would silently blow up every value to 22px',
  pms.includes('class="cfv n"') && !pms.includes('class="v n"') && !/<td class="v"/.test(pms));
T('the Mail button of the reservation screen and of the panel both send at once, with a loading state and a success message, no box to fill in', pms.includes("q('#aMail').onclick=e=>bkpMail(B,e.currentTarget)") && pms.includes("w.querySelector('#bkpMl').onclick=e=>bkpMail(B,e.currentTarget)") && pms.includes("btn.innerHTML='<span class=\"spin\"></span> Sending...'") && pms.includes("centerNote('Confirmation sent successfully to '+to+'.','saved')") && !pms.includes("modal('Send by Maha Mail'"));
T('the automatic mail is a hotel preference, off by default, and only for a confirmed Direct reservation (company DIR) that has a guest email; OTA and walk-in bookings are sent by hand', pms.includes('H.set.autoConfirmMail!==true') && pms.includes("co.code!=='DIR'") && pms.includes('if(!walkin)autoConfirmMail(B);') && pms.includes("s.autoConfirmMail=!!$('#mp_auto',box).checked") &&pms.includes('Send the confirmation mail automatically when a <b>Direct reservation</b> is made (off by default)'));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
