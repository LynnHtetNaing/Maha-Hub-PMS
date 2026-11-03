/* Back button on every page: goes to the page the person came from (Room Grid > New Reservation > Back to Room Grid).
     node tests/sync/back-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
T('go() remembers the page being left (not on Back itself, not when the same page is opened again)', src.includes('const NAVSTACK=[];') && src.includes('NAVSTACK.push({v:VIEW,a:VARG})') && src.includes('if(wasBack){}') && src.includes('!(VIEW===v&&sameArg(VARG,arg))'));
T("the browser's own back button keeps the list in step", src.includes('else if(ROUTE_SILENT){const t=NAVSTACK[NAVSTACK.length-1];if(t&&t.v===v&&sameArg(t.a,arg))NAVSTACK.pop()}'));
T('Back opens the newest earlier page this person may still open, in its own area', src.includes('function goBack(){let t;while((t=NAVSTACK.pop())){') && src.includes('viewAllowed(t.v)') && src.includes('setArea(areaOfView(t.v))'));
T('one click handler for every Back button', src.includes("closest('[data-pgback]')"));
T('every standard page header carries it, labelled with the page it returns to', src.includes("const bk=lead||((noBack||/pgback/.test(extra||''))?'':backBtnHtml());") && src.includes("'Back to '+esc(navLabel(i.v))"));
T('pages with their own header carry it too (Housekeeping Status, Forecast) and the Backend Billing pages use the standard header', src.includes("<div class=\"hkh\">${backBtnHtml()}") && src.includes("<div class=\"fch\">${backBtnHtml()}") && src.includes('el.innerHTML=pageHead(esc(title))+'));
T('the list starts empty after sign-out and when switching Frontend / Backend', src.includes('if(!DB.session){NAVSTACK.length=0;showLogin();return}') && src.includes('if(!hasBackend()||a===curArea())return;NAVSTACK.length=0;'));
T("the Reservation page keeps its own 'Back to Room Grid / list' button", src.includes("${resBack==='fo.grid'?'Back to Room Grid':'Back to list'}"));
T('Back follows only pages opened from another page; a page chosen from the menu, sidebar, top bar or area switch starts fresh with no Back', src.includes("e.target.closest('#msb,#menubar,#mobnav,.topbar,header,#areaSw')") && src.includes('else if(NAV_MENU){NAVSTACK.length=0}'));
T('Back is always on the left, before the title; Arrivals and Departures detail pages keep only their Full list button; the Reservation page keeps its own Back text but on the left too', src.includes("const pageHead=(t,extra='',mode,noBack,lead)=>{") && src.includes("</span>`,'act',true)+`<div id=\"arDetail\">") && src.includes("el.innerHTML=pageHead('Reservation','','act',true,`<button class=\"btn ghost sm pgback\" data-go=\"${resBack}\">"));
process.exit(fails ? 1 : 0);
