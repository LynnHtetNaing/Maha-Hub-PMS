/* In House as Room boxes (floor by floor, one look) with the List kept, and the new Room Status page (every room, the Housekeeping colours and faces, the Reservation Detail pop-up, switched on or off for each person).
     node tests/sync/roomstatus-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };

/* ---- the boxes of In House: grouped by floor, due out marked, a house account with no real room goes to Other ---- */
const code = cut('const byRoomNo=', "VIEWS['fo.inhouse']=el=>{");
const H = { rooms: [{ no: '201', floor: '2' }, { no: '202', floor: '2' }, { no: '301', floor: '3' }, { no: 'D1', floor: '1', dummy: true }] };
const build = new Function('H', 'esc', 'floorsList', 'floorName', 'stayMark', 'pax', 'fd', 'gName', 'G', code + '\nreturn {stayBoxes};');
const B = (id, room, dep, k) => ({ id, room, dep, type: 'STD', guestId: 'g' + id, adults: 2, children: 0, k });
const list = [B('1', '202', '2026-11-12', 'IH'), B('2', '201', '2026-11-10', 'DO'), B('3', '301', '2026-11-14', 'CI'), B('4', 'D1', '2026-12-30', 'IH')];
const html = build(H, s => String(s), () => ['2', '3'], f => 'Floor ' + f, b => ({ k: b.k }), b => b.adults + '/' + b.children, d => d, g => g.id, id => ({ id })).stayBoxes(list);
const at = (s, i) => html.indexOf(s, i);
T('each floor is its own block, in floor order', at('Floor 2') > -1 && at('Floor 3') > at('Floor 2') && at('Other') > at('Floor 3'));
T('rooms of a floor are in room order', at('>201<') > -1 && at('>201<') < at('>202<'));
T('a due out room has the Due out mark and a room checked in today has the In today mark', html.includes('rtag">Due out') && html.includes('rtag in">In today'));
T('a house account with no real room goes to Other', html.indexOf('>D1<') > html.indexOf('Other'));
T('In House boxes have one look (no housekeeping colour): the box class is rbt ih', html.includes('class="rbt ih"') && !html.includes('class="rbt hk"'));

/* ---- the code of the pages ---- */
T('In House: Room boxes or List, the choice is kept, the List is the old table', src.includes("data-ihv=\"rooms\"") && src.includes("localStorage.setItem('maha.ih.view'") && src.includes("if(IHV.v==='list')stayList(el,'In House',list,'ih',sw)"));
T('a box opens the Reservation Detail pop-up', src.includes('hsResDetail(B)') && src.includes("data-ores=\"${b.id}\""));
T('the pop-up repaints In House and Room Status when it closes', src.includes("['fo.status','fo.inhouse','rm.roomstatus'].includes(VIEW)"));
T('Room Status uses the Housekeeping colours (HKCOL) and the same room state, faces smile / frown / moon / ban', src.includes("style=\"background:${HKCOL[s.key]}\"") && src.includes('all=H.rooms.filter(r=>!r.dummy).map(rm=>({rm,s:roomState(rm)}))') && src.includes("s.key==='sleep'?'moon'"));
T('Room Status: a room with a guest opens the Reservation Detail, another room or a right-click / long press opens the housekeeping room window', src.includes('b.onclick=()=>{if(B)hsResDetail(B);else roomPopup(no)}') && src.includes('b.oncontextmenu=e=>{e.preventDefault();roomPopup(no)}'));
T('Room Status is in the menu under Housekeeping Status, with its own function and permission (on or off for each person)', src.includes("['Housekeeping Status','rm.hkstatus','','fn.rm.hkstatus'],['Room Status','rm.roomstatus','roomstatus','fn.rm.roomstatus']") && src.includes("['roomstatus','Open Room Status (every room with its guest)']") && src.includes("'hk','roomstatus','notif','profile'") && src.includes("if(!can('roomstatus'))"));
T('people who work at the front desk keep the page: a one time step gives the permission to Manager, Front desk, HOD and people who can check in or edit a reservation', src.includes('h._rsMig'));
process.exit(fails ? 1 : 0);
