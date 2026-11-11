/* In House as Room boxes (floor by floor, one look) with the List kept, and the new Room Status page (every room, the Housekeeping colours and faces, the Reservation Detail pop-up, switched on or off for each person).
     node tests/sync/roomstatus-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };

/* ---- the boxes of In House: grouped by floor, due out marked, a house account (dummy room) is never shown as a box ---- */
const code = cut('const byRoomNo=', "VIEWS['fo.inhouse']=el=>{");
const H = { rooms: [{ no: '201', floor: '2' }, { no: '202', floor: '2' }, { no: '301', floor: '3' }, { no: 'D1', floor: '1', dummy: true }] };
const build = new Function('H', 'esc', 'floorsList', 'floorName', 'stayMark', 'pax', 'fd', 'gName', 'G', 'HKCOL', 'ic', code + '\nreturn {stayBoxes};');
const B = (id, room, dep, k) => ({ id, room, dep, type: 'STD', guestId: 'g' + id, adults: 2, children: 0, k });
const list = [B('1', '202', '2026-11-12', 'IH'), B('2', '201', '2026-11-10', 'DO'), B('3', '301', '2026-11-14', 'CI'), B('4', 'D1', '2026-12-30', 'IH')];
const html = build(H, s => String(s), () => ['2', '3'], f => 'Floor ' + f, b => ({ k: b.k }), b => b.adults + '/' + b.children, d => d, g => g.id, id => ({ id }), { oc: '#3d7de0' }, () => '').stayBoxes(list);
const at = (s, i) => html.indexOf(s, i);
T('each floor is its own block, in floor order', at('Floor 2') > -1 && at('Floor 3') > at('Floor 2'));
T('rooms of a floor are in room order', at('>201<') > -1 && at('>201<') < at('>202<'));
T('a due out room has the red @ mark and a room checked in today has the green @ mark', html.includes('class="tmk dep"') && html.includes('class="tmk arr"'));
T('a house account with no real room goes to Other', !html.includes('>D1<') && !html.includes('Other'));
T('In House boxes use the Housekeeping dashboard look (dark floor blocks, tiles) in one colour (occupied)', html.includes('class="hkt ihT" data-ores=') && html.includes('background:#3d7de0') && html.includes('class="fbk"') && !html.includes('class="dfl"'));

/* ---- the code of the pages ---- */
T('In House: search box with what to search by at its left, Floor, Room type, Sort by, Room View / List View; the choices stay until changed; the List is the old table', src.includes('id="ihBy"') && src.includes('id="ihQ"') && src.includes('id="ihFl"') && src.includes('id="ihTy"') && src.includes('id="ihSo"') && src.includes('>List View</button><button type="button" data-ihv="rooms"') && src.includes('const IHS={by:') && src.includes("localStorage.setItem('maha.ih.view'") && src.includes('stayTableHtml(list)'));
T('a box opens the Reservation Detail pop-up', src.includes('hsResDetail(B)') && src.includes("data-ores=\"${b.id}\""));
T('the pop-up repaints In House and Room Status when it closes', src.includes("['fo.status','fo.inhouse','rm.roomstatus','res.list'].includes(VIEW)"));
T('Room Status uses the Housekeeping colours (HKCOL) and the same room state, faces smile / frown / moon / ban', src.includes('style="background:${HKCOL[s.key]}"') && src.includes('all=H.rooms.filter(r=>!r.dummy).map(rm=>({rm,s:roomState(rm)}))') && src.includes("s.key==='sleep'?'moon'"));
T('Room Status: a room with a guest opens the Reservation Detail, another room or a right-click / long press opens the housekeeping room window', src.includes('b.onclick=()=>{if(B)hsResDetail(B);else roomPopup(no)}') && src.includes('b.oncontextmenu=e=>{e.preventDefault();roomPopup(no)}'));
T('Room Status is in the menu under Housekeeping Status, with its own function and permission (on or off for each person)', src.includes("['Housekeeping Status','rm.hkstatus','','fn.rm.hkstatus'],['Room Status','rm.roomstatus','roomstatus','fn.rm.roomstatus']") && src.includes("['roomstatus','Open Room Status (every room with its guest)']") && src.includes("'hk','roomstatus','notif','profile'") && src.includes("if(!can('roomstatus'))"));
T('people who work at the front desk keep the page: a one time step gives the permission to Manager, Front desk, HOD and people who can check in or edit a reservation', src.includes('h._rsMig'));
T('an owner, a protected user or a manager always sees Room Status', src.includes("(p==='roomstatus'&&!!(u.owner||u.protected||u.role==='Manager'))"));
T('the guest VIP is a switch (off unless the guest is VIP) in the guest profile and the guest sheet, no typing', src.includes('<label class="vipsw"><input type="checkbox" id="gVip"') && src.includes('<label class="vipsw"><input type="checkbox" id="sVip"') && src.includes("vip:q('#gVip').checked?(g.vip||'VIP'):''") && src.includes("vip:q('#sVip').checked?(g.vip||'VIP'):''"));
T('the switch is List View then Room View, at the right end of the filter bar; dates read check-in - check-out; adults and children are written out', src.includes('data-ihv="list" aria-pressed="${IHV.v===\'list\'}">List View</button><button type="button" data-ihv="rooms"') && src.includes("const stayDates=b=>fd(b.checkinDate||b.arr)+' - '+fd(b.dep)") && src.includes("const paxTxt=b=>(b.adults||0)+' Ad'") && src.includes('.ihsw{margin-left:auto'));
T('List View: a click on a row opens the Reservation Detail pop-up like a box; the Folio button still opens the folio', src.includes('<tr class="click" data-ores="${b.id}" title="Open the reservation">') && src.includes("$('tr[data-ores]',res).forEach(x=>x.onclick=e=>{if(e.target.closest('button,a'))return;"));
T('Reservation List / Change: a row opens the Reservation Detail pop-up (not a separate page) and the list is repainted when it closes', src.includes("$('[data-ores]',el).forEach(t=>t.onclick=()=>{const B=bookingById(t.dataset.ores);if(B)hsResDetail(B)})};") && src.includes("['fo.status','fo.inhouse','rm.roomstatus','res.list'].includes(VIEW)"));
process.exit(fails ? 1 : 0);
