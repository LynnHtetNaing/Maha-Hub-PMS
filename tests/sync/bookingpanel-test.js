/* The booking panel: a booking opens as a confirmation that slides in from the right (half of the screen); Edit opens the Reservation Detail page.
     node tests/sync/bookingpanel-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('every click on a booking opens the panel (hsResDetail); the old Reservation Detail page is the Edit page (hsResEdit)',
  /function hsResEdit\(b\)\{const m=modal\('Reservation Detail'/.test(src) && /function hsResDetail\(b\)\{\n  closeBkp\(true\);/.test(src) && !/function hsResDetail\(b\)\{const m=modal/.test(src));
T('the panel is half of the screen, comes from the right, and the whole panel scrolls',
  /\.bkp-panel\{[^}]*right:0;[^}]*width:50%/.test(src) && /\.bkp-panel\{[^}]*overflow:auto/.test(src) && /translateX\(102%\)/.test(src));
T('the close button is the same round button, red on hover, as the pop-ups',
  /\.bkp \.mx\{width:40px;height:40px;border-radius:50%/.test(src) && /\.bkp \.mx:hover\{background:#c0392b/.test(src));
T('the sections have titles with an icon: Stay Details, Booking Details, Guest Details, Charges Details, Notes',
  ['Stay Details', 'Booking Details', 'Guest Details', 'Charges Details', "'Notes'"].every(t => src.includes("'" + t.replace(/'/g, '') + "'") || src.includes(t)));
T('Booking Details shows status, room, room type with code, rate plan with code, rate per night, pax, channel, source, booked, modified and cancelled dates',
  ['Booking Status', "'Room'", 'Room Type', 'Rate Plan', 'Rate per Night', "'Pax'", "'Channel'", 'Booking Source', 'Booked Date', 'Modified Date', 'Cancelled Date'].every(t => src.includes(t)));
T('Check-in shows only for an arrival today and Check-out only for an in-house guest leaving today; Edit, Print and Mail always',
  /arriveToday=\['confirmed','tentative'\]\.includes\(B\.status\)&&B\.arr===today&&can\('checkin'\)/.test(src) && /leaveToday=B\.status==='inhouse'&&B\.dep===today&&can\('checkout'\)/.test(src) && src.includes('id="bkpEd"') && src.includes('id="bkpPr"') && src.includes('id="bkpMl"'));
T('payment status is one of Paid, Pay at the hotel, OTA collect, Partially paid', ['Paid', 'Partially paid', 'Pay at the hotel', 'OTA collect'].every(t => src.includes("'" + t + "'")));
T('a cancellation date is red, no room or no change shows a dash', /kv\('Cancelled Date',esc\(d\.cancelled\),'red'\)/.test(src) && /B\.room\?esc\(B\.room\):'-'/.test(src) && /modified:last\?bkpDT\(last\.bd,last\.at\):'-'/.test(src));
T('notes are shown as a bullet list; the panel closes with Esc and respects reduced motion', src.includes('<ul class="bkp-notes">') && src.includes("e.key==='Escape'&&!MODALS.length") && /prefers-reduced-motion:reduce\)\{\.bkp-panel/.test(src));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
