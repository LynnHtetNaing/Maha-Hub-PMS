/* The live calendar a customer sees: the free times are worked out from the Google Calendar and the CRM Meetings.
     node tests/sync/slots-test.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'supabase', 'functions', '_shared');
let strip = null; try { strip = require('node:module').stripTypeScriptTypes; } catch (e) { /* older Node */ }
if (!strip) { console.log('SKIP this Node cannot strip types'); process.exit(0); }
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

const src = strip(fs.readFileSync(path.join(root, 'slots.ts'), 'utf8'), { mode: 'strip' }).replace(/^import .*$/gm, '').replace(/^export /gm, '');
const startOf = (d, t) => new Date(d + 'T' + t + ':00+07:00').getTime();
const day = (n) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const wd = d => new Date(d + 'T12:00:00+07:00').getUTCDay();
let target = ''; for (let n = 5; n < 15; n++) if (wd(day(n)) === 3) { target = day(n); break; }   /* a Wednesday 5 to 14 days ahead */
let sunday = ''; for (let n = 5; n < 15; n++) if (wd(day(n)) === 0) { sunday = day(n); break; }

let events = [], crm = [];
const admin = { from: () => { const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, then: (r) => r({ data: crm.map(a => ({ data: a })) }) }; return q; } };
const mod = new Function('Deno', 'GAP_MIN', 'MEET_MIN', 'CALL_MIN', 'listEvents', 'startOf', 'createClient', src + '\nreturn { freeSlots, isFree };')(
  { env: { get: () => undefined } }, 90, 60, 30, async () => events.slice(), startOf, null);

(async () => {
  events = [{ s: startOf(target, '09:00'), e: startOf(target, '10:00') }];
  const meet = (await mod.freeSlots(admin, target, 1, 'meeting'))[target] || [], call = (await mod.freeSlots(admin, target, 1, 'call'))[target] || [];
  T('a meeting at 9:00 is taken: 09:30 and 10:00 are not offered, the first free meeting time is 10:30', !meet.includes('09:00') && !meet.includes('09:30') && !meet.includes('10:00') && meet[0] === '10:30');
  T('before it: 07:30 would be fine but the day starts at 09:00 (opening hours)', !meet.includes('07:30') && !call.includes('08:30'));
  T('a call (30 minutes) only must not overlap: 10:00 is free, 09:30 is not', call.includes('10:00') && !call.includes('09:30') && !call.includes('09:00'));
  T('the last meeting time ends at closing time (17:00): 16:00 is the last start, 16:30 is not offered', meet.includes('16:00') && !meet.includes('16:30') && call.includes('16:30') && !call.includes('17:00'));
  T('the grid is every 30 minutes', meet.every(t => /:(00|30)$/.test(t)));
  crm = [{ meeting: true, date: target, time: '13:00', meetStatus: 'On Process' }, { meeting: true, date: target, time: '15:00', meetStatus: 'Reject' }];
  events = [];
  const m2 = (await mod.freeSlots(admin, target, 1, 'meeting'))[target] || [];
  T('a CRM meeting at 13:00: 11:30 is free (90 minutes before), 12:00 to 14:00 are not, 14:30 is free; a rejected meeting (15:00) frees its time', m2.includes('11:30') && !m2.includes('12:00') && !m2.includes('13:30') && !m2.includes('14:00') && m2.includes('14:30') && m2.includes('15:00'));
  T('isFree checks one time again (so two hotels never get the same time)', (await mod.isFree(admin, target, '14:30', 'meeting')) === true && (await mod.isFree(admin, target, '13:30', 'meeting')) === false && (await mod.isFree(admin, target, '03:00', 'call')) === false);
  const all = await mod.freeSlots(admin, day(0), 90, 'call');
  const ks = Object.keys(all).sort();
  T('it starts from today (the first free time is 2 hours from now) and is open 60 days ahead; weekends are not offered', ks.length > 0 && ks[0] >= day(0) && ks[0] <= day(3) && ks.every(d => wd(d) >= 1 && wd(d) <= 5 && d <= day(60)) && ks[ks.length - 1] >= day(55));
  const night = (await mod.freeSlots(admin, target, 1, 'meeting'))[target] || [], nightCall = (await mod.freeSlots(admin, target, 1, 'call'))[target] || [];
  T('open again at night: 09:00-17:00 and 21:00-24:00; a meeting starts at 21:00 to 23:00, a call up to 23:30; nothing from 17:00 to 20:30', night.includes('21:00') && night.includes('23:00') && !night.includes('23:30') && nightCall.includes('23:30') && !nightCall.includes('24:00') && !night.some(x => x >= '17:00' && x < '21:00') && !nightCall.some(x => x >= '17:00' && x < '21:00'));
  events = []; crm = [];
  const talk = (await mod.freeSlots(admin, target, 1, 'call', { len: 10, step: 15 }))[target] || [];
  T('Talk with the Team: a 10 minute call every 15 minutes, 09:00 to 16:45', talk[0] === '09:00' && talk[1] === '09:15' && talk.includes('16:45') && !talk.includes('17:00') && talk.every(t => /:(00|15|30|45)$/.test(t)));
  process.exit(fails ? 1 : 0);
})();
