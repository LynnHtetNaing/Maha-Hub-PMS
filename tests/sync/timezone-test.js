/* Time zones: a moment is shown in the hotel's zone on hotel screens/documents and in Bangkok time on the provider
   console, whatever the computer's own time zone is. Run it under several device zones:
     TZ=America/New_York node tests/sync/timezone-test.js ecosystem/index.html
     TZ=Asia/Tokyo       node tests/sync/timezone-test.js ecosystem/index.html
     TZ=UTC              node tests/sync/timezone-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Time zones.');
const b = src.indexOf('\n', src.indexOf('function hotelTimeNote('));
if (a < 0 || b < 0) throw new Error('time zone code not found');
const code = src.slice(a, b);

let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

function env(state) {
  const body = `
    const pad=n=>String(n).padStart(2,'0');
    const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const fd=s=>{if(!s)return '';const[y,m,d]=s.split('-');return d+'/'+m+'/'+y};
    let DB=state.DB,H=state.H;
    ${code}
    state.api={tm,tms,fdt,dateOf,todayZ,tmIn,tzp,dispZone,hotelTimeNote,tzOptions,TZ_LIST,PROVIDER_ZONE,set:(d,h)=>{DB=d;H=h}};
  `;
  new Function('state', body)(state);
  return state.api;
}
const st = { DB: { session: null, hotels: {} }, H: null };
const X = env(st);
const at = Date.UTC(2026, 9, 10, 17, 30, 0);              /* 2026-10-10 17:30:00 UTC */
const hotel = z => ({ set: { tz: z } });
const show = z => { st.H = hotel(z); st.DB.session = { hotel: 'H' }; X.set(st.DB, st.H); return [X.tm(at), X.fdt(at), X.dateOf(at), X.tms(at)]; };

console.log('device time zone for this run: ' + (process.env.TZ || '(machine default)'));
/* every zone against a known moment */
const expect = {
  'Asia/Bangkok': ['00:30', '11/10/2026 00:30', '2026-10-11', '00:30:00'],
  'Asia/Yangon': ['00:00', '11/10/2026 00:00', '2026-10-11', '00:00:00'],
  'Asia/Ho_Chi_Minh': ['00:30', '11/10/2026 00:30', '2026-10-11', '00:30:00'],
  'Asia/Vientiane': ['00:30', '11/10/2026 00:30', '2026-10-11', '00:30:00'],
  'Asia/Phnom_Penh': ['00:30', '11/10/2026 00:30', '2026-10-11', '00:30:00'],
  'Asia/Singapore': ['01:30', '11/10/2026 01:30', '2026-10-11', '01:30:00'],
  'Asia/Tokyo': ['02:30', '11/10/2026 02:30', '2026-10-11', '02:30:00'],
  'Asia/Kolkata': ['23:00', '10/10/2026 23:00', '2026-10-10', '23:00:00'],
  'Europe/London': ['18:30', '10/10/2026 18:30', '2026-10-10', '18:30:00'],
  'UTC': ['17:30', '10/10/2026 17:30', '2026-10-10', '17:30:00'],
};
for (const [z, e] of Object.entries(expect)) {
  const g = show(z);
  T('hotel in ' + z + ' sees the right time and date', JSON.stringify(g) === JSON.stringify(e), g.join(' | '));
}
/* midnight must read 00:xx, never 24:xx */
st.H = hotel('Asia/Bangkok'); X.set(st.DB, st.H);
T('midnight shows as 00:00 (not 24:00)', X.tm(Date.UTC(2026, 9, 10, 17, 0, 0)) === '00:00' && X.fdt(Date.UTC(2026, 9, 10, 17, 0, 0)) === '11/10/2026 00:00');
/* a Date object and a numeric timestamp give the same answer */
T('a Date object and a timestamp are treated alike', X.tm(new Date(at)) === X.tm(at));
/* empty value */
T('no time given shows nothing', X.tm(0) === '' && X.fdt(0) === '');

/* which zone applies: provider console = Bangkok, hotel screens = the hotel's zone */
st.H = hotel('Asia/Yangon');
st.DB.session = { provider: true };            X.set(st.DB, st.H);
T('provider console always uses Bangkok time, even when a Myanmar hotel is selected', X.dispZone() === 'Asia/Bangkok' && X.tm(at) === '00:30');
st.DB.session = { provider: true, inHotel: true }; X.set(st.DB, st.H);
T('provider working inside a hotel sees that hotel\'s time (like its staff)', X.dispZone() === 'Asia/Yangon' && X.tm(at) === '00:00');
st.DB.session = { hotel: 'MM01' };             X.set(st.DB, st.H);
T('hotel staff see the hotel\'s zone, not the computer\'s', X.dispZone() === 'Asia/Yangon' && X.tm(at) === '00:00');
st.DB.session = null; st.H = null;             X.set(st.DB, st.H);
T('before sign-in (no hotel yet) the computer\'s own clock is used', X.dispZone() === '');
const dev = new Date(at);
const devParts = [String(dev.getHours()).padStart(2, '0') + ':' + String(dev.getMinutes()).padStart(2, '0')];
T('...and that matches the computer\'s clock', X.tm(at) === devParts[0], X.tm(at));
st.H = { set: {} }; st.DB.session = { hotel: 'X' }; X.set(st.DB, st.H);
T('a hotel with no zone set falls back to the computer\'s clock (old behaviour)', X.dispZone() === '' && X.tm(at) === devParts[0]);
st.H = hotel('Not/AZone'); X.set(st.DB, st.H);
T('an unknown zone name never breaks anything', X.tm(at) === devParts[0]);

/* "today" near midnight differs between countries */
const realNow = Date.now;
Date.now = () => Date.UTC(2026, 9, 10, 17, 15, 0);   /* 00:15 on the 11th in Bangkok, 23:45 on the 10th in Yangon */
st.H = hotel('Asia/Bangkok'); st.DB.session = { hotel: 'T' }; X.set(st.DB, st.H);
const todayBkk = X.todayZ();
st.H = hotel('Asia/Yangon'); X.set(st.DB, st.H);
const todayMm = X.todayZ();
Date.now = realNow;
T('the date "today" follows the hotel\'s zone, not the computer\'s', todayBkk === '2026-10-11' && todayMm === '2026-10-10', todayBkk + ' / ' + todayMm);

/* provider log notes: hotel clock time next to Bangkok time for a hotel in another zone */
st.DB = { session: { provider: true }, hotels: { MM01: { set: { tz: 'Asia/Yangon' } }, BK01: { set: { tz: 'Asia/Bangkok' } }, NZ: { set: {} } } };
st.H = null; X.set(st.DB, st.H);
T('Myanmar hotel event shows the hotel\'s own time as well', X.hotelTimeNote('MM01', at) === ' (hotel time 00:00)', X.hotelTimeNote('MM01', at));
T('a Bangkok-zone hotel adds no note (same time)', X.hotelTimeNote('BK01', at) === '');
T('unknown hotel, or one without a zone, adds no note', X.hotelTimeNote('NOPE', at) === '' && X.hotelTimeNote('NZ', at) === '' && X.hotelTimeNote('', at) === '');

/* the setting list */
T('the provider\'s zone list includes every country mentioned and Bangkok first', X.TZ_LIST[0][0] === 'Asia/Bangkok' && ['Asia/Yangon', 'Asia/Ho_Chi_Minh', 'Asia/Vientiane', 'Asia/Phnom_Penh'].every(z => X.TZ_LIST.some(x => x[0] === z)));
T('every listed zone name is valid', X.TZ_LIST.every(([z]) => { try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return true; } catch (e) { return false; } }));
T('the dropdown marks the hotel\'s zone as selected', /value="Asia\/Yangon" selected/.test(X.tzOptions('Asia/Yangon')) && /value="Asia\/Bangkok" selected/.test(X.tzOptions('')));

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
