/* Google Calendar: a CRM meeting is a Busy event, and there are at least 1 hour 30 minutes between meetings.
     node tests/sync/calendar-test.js crm/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const crm = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const gcal = rd('supabase/functions/_shared/gcal.ts'), cal = rd('supabase/functions/crm-calendar/index.ts'), reply = rd('supabase/functions/crm-reply/index.ts'), worker = rd('workers/maha-hub-pms/src/index.js');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

/* the CRM's own check, run for real */
const i = crm.indexOf('const CAL_URL'), j = crm.indexOf('async function calClashes');
const meets = [];
const code = crm.slice(i, j).replace(/const CAL_URL = [^\n]*\n/, 'const CAL_GAP = 90, CAL_LEN = 60, CAL_CALL = 30;\n').replace(/async function calApi[\s\S]*?\n}\n/, '');
const { calLocal } = new Function('meetActs', 'meetSt', 'hotelName', code + '\nreturn { calLocal };')(() => meets, a => a.meetStatus || 'On Process', id => 'Hotel ' + id);
meets.push({ id: 'a', hotelId: '1', date: '2026-12-05', time: '09:00', meetStatus: 'On Process' });
const near = t => calLocal('2026-12-05', t, '', 60, 90).length > 0;
T('a meeting at 9:00: 10:29 is too close, 10:30 is the first free time (1 hour 30 minutes after the START of the first)', near('10:29') && near('09:30') && !near('10:30') && !near('11:00'));
T('before it: 07:31 is too close, 07:30 is free', near('07:31') && !near('07:30') && !near('06:00'));
T('another day is free', calLocal('2026-12-06', '10:00', '', 60, 90).length === 0);
T('the meeting being changed does not block itself', calLocal('2026-12-05', '09:00', 'a', 60, 90).length === 0);
meets[0].meetStatus = 'Reject';
T('a rejected meeting frees its time', !near('09:00'));
meets[0].meetStatus = 'No Show';
T('a no show frees its time', !near('09:00'));
meets[0].meetStatus = 'Completed';
T('a call (no gap) only must not fall on a meeting (9:00 to 10:00)', calLocal('2026-12-05', '09:30', '', 30, 0).length === 1 && calLocal('2026-12-05', '10:00', '', 30, 0).length === 0);

/* the CRM */
T('CRM: every saved meeting goes to the Google Calendar (Busy), a deleted / rejected / no show one is removed', crm.includes('try { calSync(r); } catch {}') && crm.includes("action: 'upsert'") && crm.includes("action: 'remove'") && crm.includes('const busy = !r.deleted && r.date && r.time && calFree(r);'));
T('CRM: both meeting forms ask first when the time is closer than 1 hour 30 minutes (and the Enewletter asks before it sends times that are taken)', crm.split('await calGuard(').length - 1 === 2 && crm.includes("confirm('These times are not free:") && crm.includes('closer than 1 hour 30 minutes'));
T('CRM: 90 minutes between meetings, 60 minutes a meeting, 30 minutes a call', crm.includes('CAL_GAP = 90, CAL_LEN = 60, CAL_CALL = 30'));

/* the functions */
T('calendar helper: a service account (no personal sign in), Bangkok time, events stay Busy, one event for each CRM record', gcal.includes('RSASSA-PKCS1-v1_5') && gcal.includes('GOOGLE_SA_JSON') && gcal.includes('+07:00') && gcal.includes('transparency: "opaque"') && gcal.includes('eventIdOf'));
T('calendar helper: 90 minutes from start to start, and a transparent (free) or cancelled event does not block', gcal.includes('"CAL_GAP_MIN") || 90') && gcal.includes('e.transparency === "transparent"') && gcal.includes('e.status === "cancelled"'));
T('crm-calendar: only a signed-in CRM member or the provider; check / upsert / remove / status', cal.includes('maha_is_crm_member') && cal.includes('maha_is_platform_admin') && ['"check"', '"upsert"', '"remove"', '"status"'].every(a => cal.includes(a)));
T('crm-reply: a time that is taken answers 409 slot_taken and nothing is recorded; a taken time is a CRM meeting or a Google event; the time becomes Busy', reply.includes('slot_taken') && reply.indexOf('slot_taken') < reply.indexOf('maha_sales_records").upsert') && reply.includes('clashes(s, e, gap)') && reply.includes('upsertEvent(rows[1].id'));
const page = rd('workers/maha-hub-pms/src/reply-page.js');
T('the answer page tells the hotel when the time is taken', page.includes("x.error === 'slot_taken'") && page.includes('This time is no longer free'));
const slots = rd('supabase/functions/_shared/slots.ts');
T('the free times: opening hours, steps, notice, a meeting 90 minutes from the start of another, a call only no overlap', slots.includes('CAL_HOURS') && slots.includes('CAL_STEP') && slots.includes('NOTICE_H') && slots.includes('Math.abs(s - b.s) < gapMin * 60000'));
process.exit(fails ? 1 : 0);
