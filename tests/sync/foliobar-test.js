/* Folio toolbar: labelled main buttons, a More menu, Check out on the right. node tests/sync/foliobar-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf('const FTB=()=>{'), b = src.indexOf('};\n', src.indexOf("return `<div class=\"toolbar ftb ftbn\">", a));
const f = src.slice(a, b);
T('on the bar, with names: Post, Payment, Advance, Transfer, Print, Detail, then More, and Check out on the right', ['fPost', 'fPay', 'fAdv', 'fMove', 'fInv', 'fDet'].every(k => f.includes("'" + k + "'")) && f.includes('id="fMoreB"') && f.includes('${FB.fBack||\'\'}${FB.fOut||\'\'}'));
T('under More, with names: Folio view, Rate setup, Split, Offset, Lock, Registration card, Notices, User logs, Cancel check-in', ["['fView','fRate','fSplit','fOff','fLock','fReg','fNot','fLog','fCCI']"].every(x => f.includes(x)));
T('every old button keeps its id, so each one still does what it did (buttons are the same elements, only moved)', ["fView", "fPost", "fMove", "fDet", "fRate", "fPay", "fAdv", "fSplit", "fOff", "fLock", "fInv", "fReg", "fNot", "fLog", "fBack", "fCCI", "fOut"].every(k => src.includes("tbF('" + k + "'")) && src.includes("$('#fOut',el).onclick=async()=>{if(await checkOut(B))reopen()}"));
T('the same disabled rules as before are used for every button (the old conditions are kept)', src.includes("tbF('fPost','plus','Post new transaction. After check-out: Rebate or Adjust (+)',B.status==='inhouse'?(closed||!can('post')):B.status!=='out')") && src.includes("tbF('fOut','out','Check out',!can('checkout')||B.status!=='inhouse')"));
T('icons are Tabler outline icons (MIT), drawn in the page', src.includes('const TBI={') && src.includes('Tabler Icons (MIT)') && src.includes('const tbi=(n,sz)=>'));
T('More opens and closes: button, click outside, Esc, and after choosing a row', src.includes("mb.onclick=e=>{e.stopPropagation();if(mm.hidden)") && src.includes("mm.addEventListener('click',close)") && src.includes("if(e.key==='Escape')close()"));
T('the menu has a fixed width (the page rule min-width:0 would squeeze it) and hover only where there is a mouse', src.includes('z-index:30;width:270px;max-width:92vw') && src.includes('@media (hover:hover){.fbtn:not(:disabled):hover'));
T('Inter is the font of the whole system (Noto Sans stays behind it for Burmese and Thai), 13px text on a computer, touch screens keep larger text', src.includes('family=Inter:wght@400;500;600;700') && src.includes('body{font:var(--fs)/1.45 Inter,"Noto Sans","Noto Sans Thai","Noto Sans Myanmar"') && !src.includes('Manrope,') && !src.includes('fx-inter') && src.includes('@media (pointer:fine){html:not(.compact),html[data-skin="modern"]:not(.compact){--fs:13px;--fs-sm:12px;--fs-table:13px}}'));
T('Check out is red: solid in Light, a soft shade in Dark', src.includes('.fbtn.out{background:#d64541;border-color:transparent;color:#fff}') && src.includes('html[data-mode=dark] .fbtn.out{background:color-mix(in srgb,#d64541 22%'));
process.exit(fails ? 1 : 0);
