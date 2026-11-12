/* The booking pages: Talk with the Team (10 minutes, no email), Book a Demo (60 minutes, confirmation email), and the "Choose a time" button of an Enewletter.
   Three steps with a loading screen between them; the Maha look; Week and Month view.
     node tests/sync/booking-test.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const fn = rd('supabase/functions/crm-book/index.ts'), rep = rd('supabase/functions/crm-reply/index.ts'), page = rd('workers/maha-hub-pms/src/reply-page.js'), wk = rd('workers/maha-hub-pms/src/index.js'), wr = rd('wrangler.toml'), crm = rd('crm/index.html');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('types: Talk with the Team is a 10 minute call with no confirmation email; Book a Demo is 60 minutes with a confirmation email; the Enewletter meeting is 60 minutes',
  /talk: \{ title: "Talk with the Team", len: 10, step: 15, what: "call", mail: false, phone: true \}/.test(fn) && /demo: \{ title: "Book a Demo", len: 60, step: 30, what: "meeting", mail: true, phone: false \}/.test(fn) && /meeting: \{ title: "Meeting with Maha Hub", len: 60/.test(fn));
T('a booking: checked again for a free time (409 slot_taken), a robot box is ignored, a customer holds at most two coming bookings, a test mail link records nothing',
  fn.includes('error: "slot_taken"') && fn.includes('str(body.website, 50)') && fn.includes('(mine || []).length >= 2') && fn.includes('pay.h === "test"'));
T('it makes a Meeting (demo) or a Follow up call (talk) for the customer, a new hotel "New Database" when unknown, and a Busy event in the Google Calendar',
  fn.includes('type: "Meeting"') && fn.includes('meetType: "Online"') && fn.includes('type: "Call"') && fn.includes('status: "New Database"') && fn.includes('upsertEvent(mid'));
T('the confirmation email (demo / meeting only): the time in Indochina Time, Google Calendar button and the calendar file; the Talk call sends nothing',
  fn.includes('if (cfg.mail)') && fn.includes('Add to Google Calendar') && fn.includes('maha-hub-booking.ics') && fn.includes('Indochina Time, ICT') && fn.includes('guests') );
T('from an Enewletter: the link opens the booking page (the button answer stays in crm-reply), the signed link gives the hotel, and the answer is listed under Replies',
  rep.includes('use_booking') && fn.includes('pay.k === "bookm" ? "meeting" : "talk"') && fn.includes('kind: "reply"') && fn.includes('choice: "book"'));
T('the page: three steps (day and time, details, confirmation) and a loading screen between them that stays at least a moment',
  page.includes('function step1') && page.includes('function step2') && page.includes('function step3') && page.includes("loading('Preparing your booking', 700") && page.includes("loading('Booking your time', 1100") && page.includes("loading('Opening the calendar', 800") && page.includes('Math.max(0, minMs'));
T('the page: Week and Month view with arrows, "What day is best for you?" / "What time works?", times in 12 hour form with the length and Indochina Time',
  page.includes('data-v="week"') && page.includes('data-v="month"') && page.includes('What day is best for you?') && page.includes('What time works?') && page.includes('function t12') && page.includes('Indochina Time (ICT)') && page.includes('aria-label="Next week"') && page.includes('aria-label="Next month"'));
T('the page: "Almost there!" has First name, Last name, Email, Hotel name, Phone (needed for Talk), a note, Change and Back, extra guests only for a demo; Confirm stays off until the form is right',
  page.includes('Almost there!') && page.includes('First name') && page.includes('Last name') && page.includes('placeholder="youremail@domain.com"') && page.includes('Invite additional guests') && page.includes("tp.key !== 'talk'") && page.includes('id="ch">Change') && page.includes('check();'));
T('the top is the Maha logo and name with the title of where they came from (Book a Demo / Talk with the Team), never a person, and NO green bar: the photo of the sign in page is the background; the font is the Maha font',
  page.includes('<b>Maha Hub</b>') && page.includes('gate-gold.png') && !/Gabrielle|Pick a time with/.test(page) && /\.top\{padding:/.test(page) && !/\.top\{[^}]*background/.test(page) && page.includes('/brand/login-hero-bg.jpg') && page.includes('rgba(6,22,16,.3)') && page.includes('Inter,"Noto Sans","Noto Sans Thai","Noto Sans Myanmar"') && page.includes('fonts.googleapis.com/css2?family=Inter') && wk.includes('font-src https://fonts.gstatic.com') && page.includes('--forest:#0A3020') && page.includes('--gold:#D49A38'));
T('the page is big on a laptop and comfortable on a phone (fluid sizes, one column under 640px, big touch targets)',
  page.includes('clamp(') && page.includes('@media(max-width:640px)') && page.includes('min-height:56px'));
T('the third step: You are booked (demo) with the Google Meet link, the confirmation text and Add to Google Calendar; We have your request (talk) with no email',
  page.includes("talk ? 'We have your request' : 'You are booked'") && page.includes('A confirmation with the Google Meet link was sent to') && page.includes('Join with Google Meet') && page.includes('Add to Google Calendar'));
T('the time zone has a line of its own (not inside another sentence) and can be switched; the times are shown in the customer zone and the booking is sent as Bangkok time with the zone',
  page.includes('<div class="tz"><label>Time zone ') && page.includes("document.getElementById('tz').onchange") && page.includes('Intl.supportedValuesOf') && page.includes('function parts(') && page.includes("tz: TZ") && page.includes("slot: { date: ST.bd, time: ST.bt }") && page.includes('Bangkok time: ') && !/Choose a day, then a time\. All times are/.test(page));
T('the confirmation email: the time in the customer zone (and Bangkok time), the Google Meet link and button; the CRM keeps the Bangkok time and writes the customer zone in the description',
  fn.includes('Join with Google Meet') && fn.includes('const goodTz') && fn.includes('tz = goodTz(str(body.tz, 40))') && fn.includes('Customer time zone') && fn.includes('(Bangkok time)') && fn.includes('meetLink: meet') && fn.includes('upsertEventMeet(mid, ev)'));
T('Google Meet: a fixed room (secret MEET_LINK) or a link asked for the event; the event keeps working when Google refuses a link',
  rd('supabase/functions/_shared/gcal.ts').includes('MEET_LINK') && rd('supabase/functions/_shared/gcal.ts').includes('conferenceSolutionKey: { type: "hangoutsMeet" }') && rd('supabase/functions/_shared/gcal.ts').includes('return { ok: await upsertEvent(crmId, o), meet: "" }'));
T('real time: the free times are asked again every 30 seconds; a taken time sends the customer back to choose another',
  page.includes('}, 30000);') && page.includes('Someone just took that time'));
T('the Worker serves /book/talk and /book/demo on the CRM address and /r/<token>; routed first',
  wk.includes("/^\\/book\\/(talk|demo)$/") && wk.includes("replyPage(env, 'book', m[1])") && wr.includes('"/book/*"'));
import('../../workers/maha-hub-pms/src/index.js').then(async m => {
  const env = { ASSETS: { fetch: () => new Response('asset') }, CRM_HOST: 'crm.maha-hub.com', SUPABASE_URL: 'https://x.supabase.co' };
  const r = await m.default.fetch(new Request('https://crm.maha-hub.com/book/demo'), env), h = await r.text();
  let parses = true; try { new Function(h.split('<script>')[1].split('</scr')[0]); } catch (e) { parses = false; }
  T('the demo page loads with its script and a safe policy (only this site and the Supabase functions)', r.status === 200 && parses && h.includes('Book a Demo') && /connect-src https:\/\/x\.supabase\.co/.test(r.headers.get('content-security-policy')) && h.includes('"type":"demo"'));
  const o = await m.default.fetch(new Request('https://pms.maha-hub.com/book/demo'), env);
  T('the booking page is only on the CRM address', (await o.text()) === 'asset');
  T('the CRM Gentle reminder and Meeting request open this page (a call of 10 minutes / a meeting of 60 minutes)', crm.includes("t.kind === 'book' || t.kind === 'bookm'"));
  process.exit(fails ? 1 : 0);
});
