/* Hotel Status and Manager Dashboard in the calm design.
     node tests/sync/hotelstatus-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf("VIEWS['fo.status']=el=>{"), b = src.indexOf('\nfunction hxPrintHtml(', a), hs = src.slice(a, b);
T('title and buttons are kept', hs.includes('INQUIRY / HOTEL STATUS') && ['hsRef', 'hsDet', 'hsPr', 'hsCD'].every(i => hs.includes('id="' + i + '"')));
T('tabs: arrivals and departures show done/total, the others a count', hs.includes("['arr','Arrivals',nd(S.arrProj),nd(S.arrAct).length]") && hs.includes("['dep','Departures',nd(S.depProj),nd(S.depAct).length]") && hs.includes("t[3]!=null?t[3]+'/'+t[2].length:t[2].length"));
T('Open shows a pop-up with the reservation and never leaves the page', hs.includes('data-hso') && hs.includes('hsResPopup(x)') && src.includes('function hsResPopup(b)') && !hs.includes("go('res.open'") && !hs.includes('go("res.open"'));
T('everyone sees revenue today (reservations made) and received today (payments)', hs.includes('resOf(b).date===bd') && hs.includes('stayTotals(b).gross') && hs.includes("paymentsIn(lines.filter(l=>l.bd===bd)).filter(p=>p.amt>0)"));
T('ADR, RevPAR, month to date and departure balance only with the Reports permission', hs.includes("const mgmt=can('reports')") && hs.includes('${mgmt?`<div class="hs2-card"><h2>Management only</h2>'));
T('Money received by shift: Front Office only, one row per shift, no total row', hs.includes("isFrontOffice(user())") && hs.includes('${isFO?`<div class="hs2-card"><h2>Money received by shift</h2>') && hs.includes('shiftRecv.map') && !/Money received by shift[\s\S]{0,900}Total/.test(hs));
T('the summary chart, availability and trend are still on the page', hs.includes('id="hxChart"') && hs.includes('Availability') && hs.includes('<h2>Trend'));
T('guest mix and exceptions still open their guest list', hs.includes('data-hxl="${P}${i}"') && hs.includes("statusList(x[0],x[1])"));
const css = src.slice(src.indexOf('/* Hotel Status and Manager Dashboard (calm'), src.indexOf('/* Room Grid: the page itself'));
T('boxes and tables scroll up and down only', css.includes('.hs2-tw{border:1px solid var(--hs-ln);border-radius:12px;overflow-x:hidden;overflow-y:auto') && !/overflow-x:\s*(auto|scroll)/.test(css));
T('the colours come from the colour theme in Light and in Dark', css.includes('--hs-acc:var(--a1') && css.includes('--hs-card:var(--m-card') && css.includes('html[data-mode=dark] .hsnew'));
T('the wrapper does not use the old .hs2 grid class', hs.includes('<div class="hsnew">') && !hs.includes('<div class="hs2">'));
const d = src.indexOf("VIEWS['fo.dash']=el=>{"), dash = src.slice(d, src.indexOf('\nfunction approvalTable', d));
T('Manager Dashboard: same content as a table (glance, still to arrive, due out, open this)', ['Today at a glance', 'Still to arrive', 'Due out', 'Open this', 'City ledger open', 'Room revenue today'].every(t => dash.includes(t)) && dash.includes('data-go="${go}"'));
process.exit(fails ? 1 : 0);
