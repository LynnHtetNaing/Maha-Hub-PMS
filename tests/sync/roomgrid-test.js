/* Room Grid (half-day bars, no dummy rooms, system placement, Unassigned section, drag with a box) and the Room box (Do not move, room type change, upgrade charge).
     node tests/sync/roomgrid-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };

/* ---- where the bookings with no room are shown ---- */
const planCode = cut('function gridPlan(){', 'const gridMovable');
const addD = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) };
const overlaps = (a1, d1, a2, d2) => a1 < d2 && d1 > a2;
function plan(rooms, bookings, bd) {
  const H = { rooms, set: { bd } };
  const f = new Function('H', 'allBookings', 'live', 'skipOcc', 'overlaps', 'softHeld', 'addD', planCode + '\nreturn gridPlan();');
  return f(H, () => bookings, b => !['cancelled', 'noshow'].includes(b.status), () => false, overlaps,
    (rm, a, d) => !!(rm.softHold && overlaps(a, d, rm.softHold.from, addD(rm.softHold.to, 1))), addD);
}
const room = (no, type, x) => Object.assign({ no, type, floor: '1' }, x || {});
const bk = (id, type, a, d, o) => Object.assign({ id, type, arr: a, dep: d, status: 'confirmed', room: null }, o || {});
const R = [room('101', 'STD'), room('102', 'STD'), room('103', 'STD'), room('201', 'DLX'), room('D1', 'DUM', { dummy: true })];
let p = plan(R, [bk('a', 'STD', '2026-11-03', '2026-11-05')], '2026-11-02');
T('a booking with no room is shown in the first free room of its type', p.put.a === '101' && !p.lines.length);
p = plan(R, [bk('f', 'STD', '2026-11-03', '2026-11-05', { room: '101' }), bk('a', 'STD', '2026-11-03', '2026-11-05')], '2026-11-02');
T('a room really assigned to someone else is skipped', p.put.a === '102');
p = plan([room('101', 'STD', { ooo: { from: '2026-11-04', to: '2026-11-06', kind: 'OO' } }), room('102', 'STD', { softHold: { from: '2026-11-03', to: '2026-11-03' } }), room('103', 'STD')], [bk('a', 'STD', '2026-11-03', '2026-11-05')], '2026-11-02');
T('out of order and soft-blocked rooms are skipped', p.put.a === '103');
p = plan(R, [bk('f1', 'STD', '2026-11-03', '2026-11-05', { room: '101' }), bk('f2', 'STD', '2026-11-03', '2026-11-05', { room: '102' }), bk('f3', 'STD', '2026-11-03', '2026-11-05', { room: '103' }), bk('a', 'STD', '2026-11-04', '2026-11-06')], '2026-11-02');
T('no free room: the booking waits in the Unassigned section', p.put.a === undefined && p.lines.length === 1 && p.lines[0][0].id === 'a');
p = plan(R, [bk('f1', 'STD', '2026-11-03', '2026-11-09', { room: '101' }), bk('f2', 'STD', '2026-11-03', '2026-11-09', { room: '102' }), bk('f3', 'STD', '2026-11-03', '2026-11-09', { room: '103' }), bk('a', 'STD', '2026-11-03', '2026-11-05'), bk('b', 'STD', '2026-11-03', '2026-11-05'), bk('c', 'STD', '2026-11-05', '2026-11-07')], '2026-11-02');
T('waiting bookings share a line when their dates do not overlap', p.lines.length === 2 && p.lines[0].map(x => x.id).join() === 'a,c' && p.lines[1].map(x => x.id).join() === 'b');
p = plan(R, [bk('a', 'STD', '2026-11-03', '2026-11-05', { room: '101', status: 'inhouse' }), bk('x', 'STD', '2026-11-03', '2026-11-05')], '2026-11-02');
T('an in-house booking keeps its room', p.put.x === '102');
p = plan(R, [bk('a', 'DLX', '2026-11-03', '2026-11-05'), bk('d', 'DUM', '2026-11-03', '2026-11-05')], '2026-11-02');
T('only the room type of the booking is used; dummy rooms are never used', p.put.a === '201' && p.put.d === undefined && p.lines.length === 1);
p = plan(R, [bk('a', 'STD', '2026-11-03', '2026-11-05', { status: 'cancelled' })], '2026-11-02');
T('a cancelled booking is not shown', p.put.a === undefined && !p.lines.length);
const before = JSON.stringify(plan(R, [bk('a', 'STD', '2026-11-03', '2026-11-05'), bk('b', 'STD', '2026-11-03', '2026-11-05')], '2026-11-02').put);
T('the placement does not depend on the dates on screen (it takes none)', /function gridPlan\(\)\{/.test(planCode) && before === JSON.stringify({ a: '101', b: '102' }));

/* ---- the grid page ---- */
const grid = cut("VIEWS['fo.grid']=el=>{", 'function gridAskMove');
T('dummy rooms are not rows of the grid', /const RMS=H\.rooms\.filter\(rm=>!rm\.dummy/.test(grid));
T('a booking starts and ends in the middle of the day', /\(s\+\.5\)\/N/.test(grid) && /\(e\+\.5\)\/N/.test(grid));
T('bars that begin before or end after the dates are cut flat at the edge', /cl\?0:/.test(grid) && /cr\?1:/.test(grid));
T('rooms taken out are striped days with no letters (OO, OI, SB)', /rgx rgx-\$\{kind\}/.test(grid) && !/>\$\{kind\}<\/div>/.test(grid));
T('Unassigned is ONE line under the grid, named Unassign, frozen at the bottom', grid.split('class="grow rgr rgu"').length === 2 && grid.includes('<b>Unassign</b>') && grid.includes('class="rgfroz"') && src.includes('.rgfroz{position:sticky;bottom:0') && !grid.includes('class="rgsec"'));
T('bookings share the one line (stacked inside only when their dates overlap)', grid.includes('lanes>1?') && grid.includes("bar(b,'wait',i,waiting.length)"));
T('a booking can be dragged up or down only (the dates never move)', /translateY\(/.test(grid) && !/translateX\(/.test(grid));
T('a booking with Do not move on cannot be dragged', /gridMovable=b=>[^\n]*!b\.roomBlock/.test(src));
T('only the same room type is accepted by the drag', /r\.dataset\.type!==B\.type\)return 'type'/.test(grid));
T('a box asks first: RSVN, guest, check-in, check-out, now in, new room, with No and Confirm', ['RSVN</span>', 'Guest name</span>', 'Check-in</span>', 'Check-out</span>', 'Now in</span>', 'New room</span>', 'id="gmNo"', 'id="gmGo"'].every(x => src.indexOf(x) > 0));
T('Light and Dark colours exist for the grid', /html\[data-mode=dark\] \.rg\{/.test(src) && /\.rg\{--rg-conf/.test(src));

/* ---- the Room box ---- */
const box = cut('function assignArrival(id){', "VIEWS['fo.arrivals']=");
T('the line has room type, floor, room, status and Do not move', ['id="axT"', 'id="axF"', 'id="axR"', 'id="axS"', 'id="axD"'].every(x => box.includes(x)));
T('Do not move needs a reason', /Give a reason to turn Do not move on\./.test(box));
T('with Do not move on the room and type are locked until it is turned off', /lock=was&&S\.dnm/.test(box) && /Turn Do not move off first/.test(box));
T('a vacant dirty room gets a notice', /is Vacant Dirty\. Housekeeping must clean it/.test(box));
T('a room type change asks for the reason, Charge or No charge, and the amount', /Give a reason for the room type change\./.test(box) && /Type the amount to charge\./.test(box) && /data-c="0"/.test(box) && /data-c="1"/.test(box));
T('the charge is posted as Room Upgrade Charge with the usual code', /code:'104',desc:'Room Upgrade Charge'/.test(box));
T('a charge needs the permission to post', /canPost/.test(box) && /You need the permission to post charges/.test(box));
T('every change is written to the user logs', (box.match(/log\(/g) || []).length >= 5);
T('the old grey Block is gone from the Arrivals list; a small sign sits beside the room number, with no box under it; the number opens the Room box', !cut("VIEWS['fo.arrivals']=(el,arg)=>{", "let AS=").includes('rblk') && src.includes('class="rmcell rmlink"') && src.includes('dnmTri(b,12)') && !src.includes('<button type="button" class="rmbtn'));
T('Dark: alerts in the Room box are a soft red, not brown or gold', src.includes('--ax-warnBg:rgba(255,110,96,.12)') && !src.includes('--ax-warnBg:#3a2c08'));
T('the reservation page has the Do not move switch under Room', /id="bDnm"/.test(src) && /function dnmToggle\(/.test(src));
T('Do not move shows on the House Status page too', /occ\.dnm\|\|occ\.roomBlock/.test(src));
T('Light and Dark: the box inputs follow the mode (so their arrows are visible)', /\.arx select,\.arx input\{color-scheme:light\}/.test(src) && /html\[data-mode=dark\] \.arx select/.test(src));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
