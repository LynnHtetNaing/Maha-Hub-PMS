/* Provider Console restructuring, phase 1: where the same function already exists on both the hotel-staff side and the
   provider side, they now share one screen - the provider's fuller control appended to it, hotel staff's own view
   completely unchanged. Also: the provider's Hotels home is a list, not a grid of boxes.
     node tests/sync/provmerge-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('Hotels home (prov.home) is a searchable list, not a grid of cards', src.includes("VIEWS['prov.home']=el=>{const hs=Object.values(DB.hotels);") && src.includes('<table class="grid"><tr><th>No.</th><th>Property name</th><th>Status</th><th>Setup</th><th>Business date</th>') && !src.includes("class=\"pgrid") && !src.includes('class="pcard"'));
T('Hotels home keeps a search box and the same actions (Open hotel, Close Day)', src.includes('id="phQ"') && src.includes('data-open="${h.code}">Open hotel</button>') && src.includes("${h.active!==false&&featOn(h,'fn.cd.close')?` <button class=\"btn sm ghost\" data-cd=\"${h.code}\">"));

T('Rate Codes: the hotel\'s own read-only table is unchanged; the provider additionally gets the real rate-code editor (SEC.rates) on the same page',
  src.includes("VIEWS['profile.rates']=el=>{\n  const prov=!!(user().provider||user().isProv);") && src.includes("${prov?'<div class=\"panel pad mt\" id=\"rcProv\"></div>':''}") && src.includes("if(prov)SEC.rates($('#rcProv',el));"));

T('Transaction Codes: the hotel\'s own view-only table is unchanged; the provider additionally gets the real Charge codes and Payment methods editors (SEC.charges, SEC.pay) on the same page',
  src.includes("VIEWS['set.codes']=el=>{\n  const prov=!!(user().provider||user().isProv);") && src.includes('id="tcProvC"></div><div class="panel pad mt" id="tcProvP"></div>') && src.includes("if(prov){SEC.charges($('#tcProvC',el));SEC.pay($('#tcProvP',el))}"));

T('Rooms & Room Types: the hotel\'s own read-only tables (and its own dummy-room add/remove, unchanged) stay as they are; the provider additionally gets the real Room types and Rooms editors (SEC.types, SEC.rooms) on the same page',
  src.includes("VIEWS['set.rooms']=el=>{const prov=!!(user().provider||user().isProv);") && src.includes('bindDummyAdd(el,false);') && src.includes("if(prov){SEC.types($('#rmProvT',el));SEC.rooms($('#rmProvR',el))}"));

T('Company / Agency: the hotel-staff view (logo/email inline edit, Commission popup) is unchanged; the provider additionally gets the wizard\'s fuller company editor (SEC.companies) on the same page',
  src.includes("${prov?'<div class=\"panel pad mt\" id=\"coProvFull\"></div>':''}") && src.includes("if(prov)SEC.companies($('#coProvFull',el));"));

T('Functions: hotel staff (without provider access) see the exact same read-only summary and Signature-only Save as before; the provider sees the fuller Package/Style/PMS-titles/feature-switch editor (planEditorHtml(true) + bindPlanEditor), reached from inside the hotel instead of being told to leave it',
  src.includes("VIEWS['set.features']=el=>{if(!can('setup')&&!user().isProv){el.innerHTML='<div class=\"empty\">Hotel setup opens this page.</div>';return}") &&
  src.includes("if(prov){   /* the provider's fuller control") &&
  src.includes("el.innerHTML=pageHead('Functions')+`<div class=\"panel pad\" id=\"fnBox\">${planEditorHtml(true)}") &&
  src.includes("bindPlanEditor($('#fnBox',el));return}") &&
  src.includes("el.innerHTML=pageHead('Functions')+`<div class=\"panel pad\">${planEditorHtml(false)}") &&
  src.includes("$('#ftSave',el).onclick=()=>{if(!need('setup'))return;H.set.signature=$('#ftSig',el).value.trim();log('Booking confirmation signature saved');saveDB();toast('Saved')};"));

T('prov.functions (outside any hotel, with a hotel picker) is untouched - it still refuses to run while inside a hotel, since set.features now covers that case',
  src.includes("if(DB.session.inHotel){el.innerHTML=pageHead('Functions & plan')+`<div class=\"panel pad\"><p>Leave the hotel first."));

T('Direct booking & Google has no hotel-staff equivalent, so it is a genuinely new, provider-only addition: reachable now from inside the hotel (the Provider menu group), no longer forced to "leave the hotel first"',
  src.includes("const PROV_HOTEL_GROUP={t:'Provider',items:[['Back to provider console','prov.exit'],['Hotel Setup','prov.setup'],['Direct booking & Google','prov.google'],['EDC Card Link','prov.edc'],['Amend records','prov.amend'],['Amendment log','prov.log']]};") &&
  !src.includes("if(DB.session.inHotel){el.innerHTML=pageHead('Direct booking & Google')"));
T('prov.systems and prov.distribution are genuinely whole-platform (one table across every hotel at once), so they correctly stay provider-console-only, left alone',
  src.includes("if(!(DB.session&&DB.session.provider)||DB.session.inHotel){el.innerHTML=pageHead('Systems')+'<div class=\"empty\">Open this from the provider console (leave the hotel first).</div>';return}") &&
  src.includes("if(!(DB.session&&DB.session.provider)||DB.session.inHotel){el.innerHTML=pageHead('Distribution')+'<div class=\"empty\">Open this from the provider console (leave the hotel first).</div>';return}"));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
