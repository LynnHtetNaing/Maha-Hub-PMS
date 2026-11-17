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
T('Open hotel on an unfinished property goes straight to the Backend wizard (one step at a time, as before); a fully set-up property instead shows the exact same Select System (Frontend/Backend) layer a hotel user sees at sign-in, landing straight into that area',
  src.includes('const ck=propertyChecks(h);') && src.includes("if(ck.length&&!ck.every(c=>c.ok)){SET_SEC='profile';go('prov.setup');return}") &&
  src.includes("const a=await selectSystemPage(h,false);SEL_ON=false;") &&
  src.includes("setArea(a);provLog(`Entered hotel ${h.code} (${a==='back'?'Backend':'front office'})`);saveDB();") &&
  src.includes("await withLoading(a==='back'?'Opening Backend':'Opening Frontend',1800,async()=>{applySysPath('hub');renderShell();go(a==='back'?firstBackendView():firstHotelView())});"));
T('a provider inside a hotel gets the exact same Frontend/Backend split a manager gets, but admin\'s own Backend is built fresh from the Provider Console\'s own sections (Hotel Setup, one subtitle per section), not the hotel-staff\'s merged Backend menu; hasBackend only switches on for a provider while inside a hotel',
  src.includes("function hasBackend(){try{return !!(DB&&DB.session&&H&&can('setup')&&(!DB.session.provider||DB.session.inHotel))}catch(e){return false}}") &&
  src.includes("if(!se.inHotel)return base;") && src.includes("return curArea()==='back'?ADMIN_BACKEND_MENU():base.filter(m=>m.t!=='Setup')}") &&
  src.includes("function ADMIN_BACKEND_MENU(){") && src.includes("{t:'Hotel Setup',items:SET_SECTIONS.map(([k,num,title])=>[title,'hset.'+k])}") &&
  src.includes("function enterHotelBackend(code){if(!provOnly())return;openHotel(code);DB.session.inHotel=true;DB.session.at=Date.now();setArea('back');provLog(`Entered hotel ${code} (Backend)`);saveDB();applySysPath('hub');renderShell();go(firstBackendView());"));
T('the raw menu computation and the sidebar nav both stopped hard-coding the provider\'s extra items onto every area - areaMenu alone decides when they show',
  src.includes("const raw=DB.session.provider?(DB.session.inHotel?MENU:(provWsOn()?PROV_WS_MENU:PROV_MENU)):MENU;") &&
  src.includes("const src=areaMenu(DB.session.provider?(DB.session.inHotel?MENU:(provWsOn()?PROV_WS_MENU:PROV_MENU)):MENU);"));

T('Rate Codes: the hotel\'s own read-only table is unchanged; the provider additionally gets the real rate-code editor (SEC.rates) on the same page',
  src.includes("VIEWS['profile.rates']=el=>{\n  const prov=!!(user().provider||user().isProv);") && src.includes("${prov?'<div class=\"panel pad mt\" id=\"rcProv\"></div>':''}") && src.includes("if(prov){SEC_BARE=false;SEC.rates($('#rcProv',el))}"));

T('Transaction Codes: the hotel\'s own view-only table is unchanged; the provider additionally gets the real Charge codes and Payment methods editors (SEC.charges, SEC.pay) on the same page',
  src.includes("VIEWS['set.codes']=el=>{\n  const prov=!!(user().provider||user().isProv);") && src.includes('id="tcProvC"></div><div class="panel pad mt" id="tcProvP"></div>') && src.includes("if(prov){SEC_BARE=false;SEC.charges($('#tcProvC',el));SEC.pay($('#tcProvP',el))}"));

T('Rooms & Room Types: the hotel\'s own read-only tables (and its own dummy-room add/remove, unchanged) stay as they are; the provider additionally gets the real Room types and Rooms editors (SEC.types, SEC.rooms) on the same page',
  src.includes("VIEWS['set.rooms']=el=>{const prov=!!(user().provider||user().isProv);") && src.includes('bindDummyAdd(el,false);') && src.includes("if(prov){SEC_BARE=false;SEC.types($('#rmProvT',el));SEC.rooms($('#rmProvR',el))}"));

T('Company / Agency: the hotel-staff view (logo/email inline edit, Commission popup) is unchanged; the provider additionally gets the wizard\'s fuller company editor (SEC.companies) on the same page',
  src.includes("${prov?'<div class=\"panel pad mt\" id=\"coProvFull\"></div>':''}") && src.includes("if(prov){SEC_BARE=false;SEC.companies($('#coProvFull',el))}"));

T('Functions: hotel staff (without provider access) see the exact same read-only summary and Signature-only Save as before; the provider sees the fuller Package/Style/PMS-titles/feature-switch editor (planEditorHtml(true) + bindPlanEditor), reached from inside the hotel instead of being told to leave it',
  src.includes("VIEWS['set.features']=el=>{if(!can('setup')&&!user().isProv){el.innerHTML='<div class=\"empty\">Hotel setup opens this page.</div>';return}") &&
  src.includes("if(prov){   /* the provider's fuller control") &&
  src.includes("el.innerHTML=pageHead('Functions')+`<div class=\"panel pad\" id=\"fnBox\">${planEditorHtml(true)}") &&
  src.includes("bindPlanEditor($('#fnBox',el));return}") &&
  src.includes("el.innerHTML=pageHead('Functions')+`<div class=\"panel pad\">${planEditorHtml(false)}") &&
  src.includes("$('#ftSave',el).onclick=()=>{if(!need('setup'))return;H.set.signature=$('#ftSig',el).value.trim();log('Booking confirmation signature saved');saveDB();toast('Saved')};"));

T('prov.functions (outside any hotel, with a hotel picker) is untouched - it still refuses to run while inside a hotel, since set.features now covers that case',
  src.includes("if(DB.session.inHotel){el.innerHTML=pageHead('Functions & plan')+`<div class=\"panel pad\"><p>Leave the hotel first."));

T('Direct booking & Google has no hotel-staff equivalent, so it is a genuinely new, provider-only addition: reachable now from inside the hotel (the trimmed Provider menu group - Hotel Setup and EDC Card Link moved out/removed), no longer forced to "leave the hotel first"',
  src.includes("const PROV_HOTEL_GROUP={t:'Provider',items:[['Back to provider console','prov.exit'],['Direct booking & Google','prov.google'],['Stripe payments (this hotel)','prov.stripe'],['Amend records','prov.amend'],['Amendment log','prov.log']]};") &&
  !src.includes("if(DB.session.inHotel){el.innerHTML=pageHead('Direct booking & Google')"));
T('This hotel\'s own Stripe keys (guest/OTA card payments) are reachable from the Provider menu while inside the hotel too, since they are set up one hotel at a time', src.includes("['Stripe payments (this hotel)','prov.stripe']"));
T('prov.systems and prov.distribution are genuinely whole-platform (one table across every hotel at once), so they correctly stay provider-console-only, left alone',
  src.includes("if(!(DB.session&&DB.session.provider)||DB.session.inHotel){el.innerHTML=pageHead('Systems')+'<div class=\"empty\">Open this from the provider console (leave the hotel first).</div>';return}") &&
  src.includes("if(!(DB.session&&DB.session.provider)||DB.session.inHotel){el.innerHTML=pageHead('Distribution')+'<div class=\"empty\">Open this from the provider console (leave the hotel first).</div>';return}"));

T('each Hotel Setup subtitle page has its own icon in the title (not the same folder icon for every one)',
  ['hotel profile','currency, tax & service','business date & times','floors','room types','rooms','floor plan','charge codes','payment methods','companies & agents','room totals','registration card & invoice','tax invoice reference','booking confirmation mail','review & activate']
    .every(k => src.includes(`'${k}':`)));

T('a Hotel Setup subtitle page (hset.*) shows its section once, under the page\'s own title - no second numbered heading or blurb, and no box nested inside another box',
  src.includes('let SEC_BARE=false;') &&
  src.includes("const secHead=(t,d)=>SEC_BARE?'':`<h2 class=\"sut\">${esc(t)}</h2>${d?`<p class=\"sub\">${d}</p>`:''}`;") &&
  src.includes("el.innerHTML=pageHead(title)+'<div id=\"hsBox\"></div>';\n  SEC_BARE=true;SEC[k]($('#hsBox',el))}});") &&
  src.includes("ck=propertyChecks(H),ok=k=>{const c=ck.find(x=>x.k===k);return c?c.ok:null};SEC_BARE=false;"));

T('Terms & Conditions as a Hotel Setup subtitle page drops the embedded page\'s own duplicate title and hotel picker, keeping just the editor',
  src.includes("terms(box){VIEWS['prov.terms'](box);if(SEC_BARE){const ph=box.querySelector('.phead');if(ph)ph.remove()}else box.insertAdjacentHTML('afterbegin',secHead('15. Terms & Conditions'))},"));

T('Direct booking & Google (reached from inside a hotel via the Provider menu) is bare too - its own title already comes from the outer page',
  src.includes("bindPicker(el);SEC_BARE=true;SEC.google($('#gBody',el));"));

T('a handful of pale light-mode-only badges/boxes on the Hotel Setup pages (payment methods, hotel logo, terms preview, Ready/Match/Active pills, card-details box) get a real dark-mode colour instead of staying a stray light patch',
  ['.cbh{color:var(--m-ink)}', '.payitem.on{border-color:#2f6b47', '.autoadd{background:#17304f;color:#9cc7f0}', '.rg{background:#ffffff14', '.logoprev{background:var(--m-card)', '.tclang .tcprev{color:var(--m-mut)}', '.pill.g{background:#16a34a33;color:#4ade80}', '.pst.on{background:#16a34a2e;color:#4ade80}', '.pst.off{background:#e11d4833;color:#fb7185}']
    .every(frag => src.includes('html[data-skin="modern"][data-mode=dark] ' + frag)));

T('Modern is the only design left - no Classic choice anywhere: skinIsModern is unconditional, applySkin only ever sets data-skin="modern", and the per-hotel Style picker (Classic/Modern) is gone from Functions',
  src.includes('function skinIsModern(){return true}') &&
  src.includes(`function applySkin(){try{const root=document.documentElement;root.setAttribute('data-skin','modern');root.setAttribute('data-pal',userTheme());root.setAttribute('data-mode',userMode())}catch(e){}}`) &&
  !src.includes('HOTEL_SKINS') && !src.includes('data-skin-pick') && !src.includes("root.setAttribute('data-skin','classic')"));

T('the Provider Console now renders with the Modern sidebar shell even with no hotel open at all (a brand-new provider, or any whole-system page) - the sidebar shows "Provider console" / "Maha Hub" instead of crashing on a missing H',
  src.includes("<div class=\"msb-prop\"><small>${H?'Current property':'Provider console'}</small><b>${H?esc(H.set.name):'Maha Hub'}</b>${H?'<button type=\"button\" class=\"msb-chain\" id=\"msbChain\" hidden>Your Chain Hotels</button>':''}</div>"));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
