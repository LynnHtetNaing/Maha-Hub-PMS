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
T('Unassign is ONE ordinary row after the rooms: not frozen, no dividing line', grid.split('class="grow rgr rgu"').length === 2 && grid.includes('<b>Unassign</b>') && !src.includes('rgfroz') && !grid.includes('class="rgsec"'));
T('the drag goes on while the pointer is below or above the box: the box scrolls by itself and the nearest row is the target', grid.includes('setInterval(tick,30)') && grid.includes('sb.bottom-50') && grid.includes('Math.max(lastY,sb.top+60),sb.bottom-2') && grid.includes('clearInterval(timer)'));
T('bookings share the one line (stacked inside only when their dates overlap)', grid.includes('lanes>1?') && grid.includes("bar(b,'wait',i,waiting.length)"));
T('a booking can be dragged up or down only (the dates never move)', /translateY\(/.test(grid) && !/translateX\(/.test(grid));
T('a booking with Do not move on cannot be dragged', /gridMovable=b=>[^\n]*!b\.roomBlock/.test(src));
T('only the same room type is accepted by the drag', /r\.dataset\.type!==B\.type\)return 'type'/.test(grid));
T('a box asks first: RSVN, guest, check-in, check-out, now in, new room, with No and Confirm', ['RSVN</span>', 'Guest name</span>', 'Check-in</span>', 'Check-out</span>', 'Now in</span>', 'New room</span>', 'id="gmNo"', 'id="gmGo"'].every(x => src.indexOf(x) > 0));
T('Light and Dark colours exist for the grid', src.includes('html[data-mode=dark] .rg,html[data-mode=dark] .rglegend{') && src.includes('.rg,.rglegend{--rg-conf'));

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
T('the old grey Block is gone from the Arrivals list; a small sign sits beside the room number (plain text); an Assign column sits between Status and Check in', !cut("VIEWS['fo.arrivals']=(el,arg)=>{", "let AS=").includes('rblk') && src.includes('class="sic cibig asgbig') && src.includes('data-dnm="${b.id}"') && src.includes('dnmInfo(B,()=>render())') && !src.includes('<button type="button" class="rmbtn') && src.includes('<th>Status</th><th class="c">Assign</th><th class="c">Check in</th>'));
T('Dark: alerts in the Room box are a soft red, not brown or gold', src.includes('--ax-warnBg:rgba(255,110,96,.12)') && !src.includes('--ax-warnBg:#3a2c08'));
T('the reservation page has the Do not move switch under Room', /id="bDnm"/.test(src) && /function dnmToggle\(/.test(src));
T('Do not move on the reservation page: a plain switch with no ring, a sign beside it when on', src.includes('class="dnmsw dnmflat"') && src.includes('id="bDnmSign"') && src.includes('.dnmflat{border:0!important'));
T('turning it on asks for the reason with Save and a close tab; when on, a fixed message box shows the reason with Close and Clear / Release', src.includes('id="dmGo">Save</button>') && src.includes('function dnmInfo(') && src.includes('Clear / Release Do not move') && src.includes('id="dmClose"') && src.includes('if(B.roomBlock){dnmInfo(B,done);return}'));
T('releasing is written to the user logs', src.includes('Do not move released; room'));
T('Do not move shows on the House Status page too', /occ\.dnm\|\|occ\.roomBlock/.test(src));
T('Light and Dark: the box inputs follow the mode (so their arrows are visible)', /\.arx select,\.arx input\{color-scheme:light\}/.test(src) && /html\[data-mode=dark\] \.arx select/.test(src));
const arr = cut("VIEWS['fo.arrivals']=(el,arg)=>{", 'const pick=');
T('Arrivals search lists every confirmed or tentative arrival in the dates chosen, future days too (check-in only from the arrival day)', arr.includes("arrivalsIn(sp.from,sp.to).filter(b=>['confirmed','tentative'].includes(b.status))") && !arr.includes('b.arr<=H.set.bd));') && arr.includes('b.arr<=H.set.bd&&[') );
T('Arrivals list is compact so every column and button stays on the page', src.includes('table.grid.arrfit th,table.grid.arrfit td{padding:6px 7px') && src.includes('.panel:has(>table.arrfit){overflow-x:auto}'));
T('the Room Grid has no explanation paragraph under the filters', !grid.includes('From the day before the business date, 14 days.'));
T('the colours and signs are listed under the grid in aligned columns, with their swatches in Light and Dark', grid.includes('class="legend rglegend"') && src.includes('.rg,.rglegend{--rg-conf') && src.includes('html[data-mode=dark] .rglegend{--rg-conf') && src.includes('.rglegend{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))') && grid.includes('class="rgwarn"'));
T('the day highlight fills the whole row (no box by box shade)', src.includes('.grow.rgr>.rgt{margin:0;padding:0'));
T('Forecast: no shade behind the page, rounded filters, tabs and buttons with space between, calendar button follows the round corner', src.includes('Forecast page: no shade behind the page') && src.includes('html[data-skin="modern"][data-mode=dark] .fcwrap{background:transparent!important') && src.includes('.fcf .dpb{background:transparent!important'));
T('Provider console Staff page: the Department box shows its whole text and the list scrolls instead of cutting', src.includes('.upage .pptbl select[data-dept]{max-width:none;width:134px') && src.includes('.upage .pplist{overflow-x:auto;overflow-y:hidden}'));
T('Forecast buttons: icon and text are centred on one line', src.includes('Forecast buttons: the icon and the text sit on one line, centred') && src.includes('.fcbtns .btn{display:inline-flex!important;align-items:center'));
/* ---- My Shift & Cashier: float, Expected Cash Drop, petty cash ---- */
{
  const code = cut('const isCashPay=', "/* closing somebody else's shift");
  const mk = (H, lines) => new Function('H', 'allLinesH', 'paymentsIn', 'curMulti', 'curMain', 'curOthers', 'curOfLine', 'isCash', 'isCharge', 'r2', 'sum',
    code + '\nreturn {shiftTotals,shiftPetty};')(H, () => lines, ls => ls.map(l => ({ l, amt: -l.amt })), () => false, () => 'THB', () => [], () => 'THB', c => c === '900', l => l.amt > 0 && l.code !== '900', v => Math.round(v * 100) / 100, (a, f) => a.reduce((n, x) => n + f(x), 0));
  const S = { id: 's1', name: 'Morning', bd: '2026-10-20', openCash: 5000, openAt: 1 };
  const L = [
    { shiftId: 's1', code: '900', method: 'Cash', amt: -12000 }, { shiftId: 's1', code: '903', method: 'Bank Transfer', amt: -3000 },
    { shiftId: 's1', code: '900', method: 'Cash', amt: 2000 },     /* a cash refund: the folio line is plus, so the money is minus */
    { shiftId: 's1', code: '600', method: '', amt: 0 }];
  const H = { shifts: [S], petty: [{ id: 'p1', dir: 'out', amt: 350, bd: '2026-10-20', shift: 'Morning', shiftId: 's1' }] };
  let t = mk(H, L).shiftTotals(S);
  T('cash received stands alone, the refund is its own minus', t.cashIn === 12000 && t.cashOut === -2000);
  T('Expected Cash Drop = cash received - the refund taken from it', t.drop === 10000 && t.refundApplied === 2000 && t.refundFloat === 0);
  {const L2 = [{ shiftId: 's1', code: '900', method: 'Cash', amt: -1000 }, { shiftId: 's1', code: '900', method: 'Cash', amt: 2500 }];
    const t2 = mk({ shifts: [S], petty: [] }, L2).shiftTotals(S);
    T('a refund bigger than the cash received: the cash drop is 0 and the rest comes off the float', t2.drop === 0 && t2.refundApplied === 1000 && t2.refundFloat === 1500 && t2.floatIn === 3500);
    const t3 = mk({ shifts: [S], petty: [] }, [{ shiftId: 's1', code: '900', method: 'Cash', amt: 2000 }]).shiftTotals(S);
    T('no cash received at all: the whole refund comes off the float', t3.drop === 0 && t3.refundFloat === 2000 && t3.floatIn === 3000 && t3.expected === 3000);}
  T('Float in hand = opening - paid out - petty cash (+ petty paid in)', t.floatIn === 4650 && t.pettyOut === 350 && t.pettyIn === 0);
  T('cash that should be in the drawer = float + drop (the count is checked against it)', t.expected === 14650);
  H.petty[0].back = { bd: '2026-10-20', shiftId: 's1' };
  t = mk(H, L).shiftTotals(S);
  T('petty cash paid in goes back into the float of the shift that receives it', t.pettyIn === 350 && t.floatIn === 5000 && t.drop === 10000 && t.expected === 15000);
  H.petty[0].back = { bd: '2026-10-21', shiftId: 's2' };
  t = mk(H, L).shiftTotals(S);
  T('paid in received in another shift does not change this shift', t.pettyIn === 0 && t.floatIn === 4650);
  const old = { shifts: [S, { id: 's9', name: 'Morning', bd: '2026-10-20', openAt: 2, openCash: 0 }], petty: [{ id: 'q', dir: 'out', amt: 100, bd: '2026-10-20', shift: 'Morning' }] };
  T('an old petty line without a shift id belongs to the first shift of that name only', mk(old, []).shiftPetty(S).out === 100 && mk(old, []).shiftPetty(old.shifts[1]).out === 0);
}
T('the cashier page: Float, Cash drop and Close shift boxes, Total collected last, no Charges posted line, no result box in Close shift', ['Float (cash in hand)', '− Petty cash', '+ Petty cash paid in', '− Refund (cash)', 'Expected Cash Drop'].every(x => src.includes(x)) && !cut("VIEWS['cd.shift']=el=>{", "VIEWS['cd.close']").includes('Charges posted') && !src.includes('id="csLeft"') && !src.includes('class="csres"'));
T('the login page: the opening cash is required, no (optional)', src.includes('<span>Opening cash</span>') && !src.includes('Opening cash (optional)') && src.includes('Enter your opening cash (type 0 if the drawer is empty).'));
T('Petty Cash page: Record petty cash, Returned by AP/AR, Not yet returned, Paid in button', ['Record petty cash', 'Returned by AP/AR', 'Not yet returned', 'data-pb='].every(x => src.includes(x)) && !src.includes('>Cash book<'));
T('CB_04 shows the refund as its own line, the float of each shift, and fills the count lines when the shift is closed', src.includes("'Refund / Void - '") && src.includes("'Float (cash in hand) - '") && src.includes('Cash counted in the drawer : <span>') && src.includes('Left in drawer (closing float) : <span>'));
T('the Shift report button opens the print preview of CB_04 for the shift that is logged in', src.includes("printPages(res.html,'Shift report - '+s.name+' shift')") && src.includes("shiftName:s.name,o:{}"));
T('Close my shift: the first click only shows a red reminder to print the Shift report, the second click closes', src.includes("if(!el._csWarned){el._csWarned=true;$('#csE',el).textContent='Please print the Shift report before you close your shift. Press Close my shift again to close it.';return}"));
T('the Reports tab opening is as before (no change to Reports)', src.includes("window.open(location.href.split('#')[0]+'#reports','mahahub-reports')") && !src.includes('rpTargetFromHash'));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
