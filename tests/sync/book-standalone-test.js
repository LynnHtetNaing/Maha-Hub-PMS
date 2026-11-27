/* The Booking Engine opens on its own: signing in through the Booking Engine sign-in lands in the Booking Engine alone (every Booking Engine page is a title
   of its own, no Frontend / Backend, no PMS menus), whether or not the hotel also uses the PMS.
     node tests/sync/book-standalone-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };

/* the menu: every hotel-visible Booking Engine page is a flat title */
const code = cut('function isBookStandalone()', 'function areaMenu(');
const HOTEL_BE_GROUP = { t: 'Booking Engine', items: [['Amenities', 'prov.be.amenities', 'setup'], ['Photos', 'prov.be.photos', 'setup'], ['Reports', 'prov.be.reports', 'setup'], ['Hidden', 'prov.be.hidden', 'admin']] };
const mk = (session, can) => new Function('DB', 'HOTEL_BE_GROUP', 'can', 'writeLiveSession', code + ';return {isBookStandalone,setStandalone,BOOK_STANDALONE_MENU}')(session, HOTEL_BE_GROUP, can, () => {});
let DB = { session: { userId: 'u1' } };
let api = mk(DB, p => p === 'setup');
T('not standalone at first', api.isBookStandalone() === false);
api.setStandalone(true);
T('standalone after the Booking Engine sign-in', api.isBookStandalone() === true && DB.session.standalone === 'book');
const m = api.BOOK_STANDALONE_MENU();
T('the menu is the Booking Engine pages as flat titles', m.length === 3 && m.every(x => x.flat && x.t) && m[0].t === 'Amenities' && m[0].flat === 'prov.be.amenities');
T('a page the person has no right to is left out', !m.some(x => x.flat === 'prov.be.hidden'));
api.setStandalone(false);
T('opening the PMS (or signing out) takes standalone away', api.isBookStandalone() === false && !('standalone' in DB.session));
DB = { session: { provider: true, standalone: 'book' } };
api = mk(DB, () => true);
T('a provider account is never put in standalone mode', api.isBookStandalone() === false);
api.setStandalone(true);
T('and setting it does nothing for a provider', DB.session.standalone === 'book' && api.isBookStandalone() === false);

/* the wiring */
T('the menu of the area is the Booking Engine menu in standalone', /function areaMenu\(src\)\{\s*if\(isBookStandalone\(\)\)return BOOK_STANDALONE_MENU\(\);/.test(src));
T('no Frontend / Backend switch in standalone', src.includes("function areaSwitchHtml(){if(isBookStandalone())return '';"));
T('opening Maha Booking sets standalone, opening the PMS clears it', src.includes("if(kind==='book'){setStandalone(true);NAVSTACK.length=0;applySysPath('book');setArea('back');renderShell();go('prov.be.amenities');return}") && src.includes("if(kind==='hub'){setStandalone(false);applySysPath('hub');renderShell();go(firstHotelView());return}"));
T('the sidebar says Maha Booking', src.includes("${isBookStandalone()?'Maha Booking':'Maha PMS'}"));
T('a reload stays in the Booking Engine (start-up checks standalone before the PMS)', (() => { const f = cut('const finish=()=>{', 'const doneBoot'); return f.includes('isBookStandalone()') && f.indexOf('isBookStandalone()') < f.indexOf("applySysPath(DB.session.provider&&!DB.session.inHotel?null:'hub')"); })());
T('no Back button anywhere in the Booking Engine on its own', src.includes("function backBtnHtml(){if(isBookStandalone())return '';"));
T('a PMS page can never open inside the Booking Engine on its own (it falls back to Amenities)', src.includes("if(isBookStandalone()&&!/^(prov") && src.includes("v='prov.be.amenities';arg=undefined}"));
T('switching system always shows the loading screen named after the destination ("Switching to Maha PMS")', src.includes("async function switchSystemTo(kind,fn){const dest=ecoSysLabel(kind);await withLoading(SWITCH_WORD+' to '+dest,1600,async()=>{try{await fn()}catch(e){}},dest)}") && src.includes("function loadingShow(msg,name){if(window.MahaLoader){MahaLoader.show({name:name||loadName()") && src.includes('async function withLoading(msg,ms,fn,name){loadingShow(msg,name);'));
T('both system switchers (the arrow and the list) go through the loading screen, and the PMS choice clears the Booking-only mode', src.includes("switchSystemTo(kind,()=>{if(kind==='hub'&&inProv){enterHotel(H.code);return}openSystem(kind,H)})") && src.includes('switchSystemTo(kind,()=>openSystem(kind,H));'));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
