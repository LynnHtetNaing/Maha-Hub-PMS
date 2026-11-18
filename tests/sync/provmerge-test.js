/* Provider Console restructuring, phase 1: where the same function already exists on both the hotel-staff side and the
   provider side, they now share one screen - the provider's fuller control appended to it, hotel staff's own view
   completely unchanged. Also: the provider's Hotels home is a list, not a grid of boxes.
     node tests/sync/provmerge-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('Hotels home (prov.home) is a searchable list, not a grid of cards', src.includes("VIEWS['prov.home']=el=>{const hs=Object.values(DB.hotels);") && src.includes('<table class="grid"><tr><th>No.</th><th>Code</th><th>Hotel</th><th>Chain</th><th>Status</th><th>Subscription until</th><th>Currency</th><th>Business date</th><th>Locked through</th>') && !src.includes("class=\"pgrid") && !src.includes('class="pcard"'));
T('Hotels home (now the one and only Hotels page - Hotels list was merged into it) keeps a search box, a row number, and an Open hotel button beside Action - no Setup fraction, no Open shifts column, no Close Day shortcut',
  src.includes('id="phQ"') && src.includes("<button class=\"btn sm gold\" data-open=\"${h.code}\">Open hotel</button> <button type=\"button\" class=\"btn sm ghost\" data-pvact=\"${h.code}\"") &&
  !src.includes('data-cd=') && !src.includes('<th>Setup</th>') && !src.includes('<th class="n">Open shifts</th>') &&
  src.includes(" {t:'Hotels List',flat:'prov.home'},") && !src.includes("VIEWS['prov.hotels']"));
T('Open hotel on an unfinished property goes straight to the Backend wizard (one step at a time, as before); a fully set-up property instead shows the exact same Select System (Frontend/Backend) layer a hotel user sees at sign-in, landing straight into that area',
  src.includes('const ck=propertyChecks(h);') && src.includes("if(ck.length&&!ck.every(c=>c.ok)){SET_SEC='profile';go('prov.setup');return}") &&
  src.includes("const a=await selectSystemPage(h,false);SEL_ON=false;") &&
  src.includes("setArea(a);provLog(`Entered hotel ${h.code} (${a==='back'?'Backend':'front office'})`);saveDB();") &&
  src.includes("await withLoading(a==='back'?'Opening Backend':'Opening Frontend',1800,async()=>{applySysPath('hub');renderShell();go(a==='back'?firstBackendView():firstHotelView())});"));
T('a provider inside a hotel gets the exact same Frontend/Backend split a manager gets, but admin\'s own Backend is built fresh from the Provider Console\'s own sections (Hotel Setup, one subtitle per section), not the hotel-staff\'s merged Backend menu; hasBackend only switches on for a provider while inside a hotel',
  src.includes("function hasBackend(){try{return !!(DB&&DB.session&&H&&can('setup')&&(!DB.session.provider||DB.session.inHotel))}catch(e){return false}}") &&
  src.includes("if(!se.inHotel)return base;") && src.includes("return curArea()==='back'?ADMIN_BACKEND_MENU():base.filter(m=>m.t!=='Setup')}") &&
  src.includes("function ADMIN_BACKEND_MENU(){") && src.includes("{t:'Hotel Setup',items:SET_SECTIONS.filter(([k])=>k!=='allot').map(([k,num,title])=>[title,'hset.'+k])}") &&
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

T('Direct Booking Engine has no hotel-staff equivalent, so it is a genuinely new, provider-only addition: reachable now from inside the hotel (the trimmed Provider menu group - Hotel Setup and EDC Card Link moved out/removed), no longer forced to "leave the hotel first"; Amendment Records and Amendment Log split out into their own Records group, not bundled in with it',
  src.includes("const PROV_HOTEL_GROUP={t:'Provider',items:[['Back to provider console','prov.exit'],['Direct Booking Engine','prov.google'],['Stripe payments (this hotel)','prov.stripe']]};") &&
  src.includes("const PROV_HOTEL_RECORDS_GROUP={t:'Records',items:[['Amendment Records','prov.amend'],['Amendment Log','prov.log']]};") &&
  !src.includes("if(DB.session.inHotel){el.innerHTML=pageHead('Direct Booking Engine')"));
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

T('Direct Booking Engine (reached from inside a hotel via the Provider menu) is bare too - its own title already comes from the outer page',
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

T('every Hotel Setup subtitle and the rest of the Provider group get a real sidebar icon (MV_ICON) instead of the same generic folder, and the group headers (Hotel Setup, Hotels, Whole system, Team & records, Account, Hotel, Connections, Records) do too (MG_ICON)',
  ['hset.profile','hset.tax','hset.bd','hset.floors','hset.types','hset.rooms','hset.plan','hset.rates','hset.charges','hset.pay','hset.companies','hset.allot','hset.docs','hset.tiref','hset.terms','hset.mailpol','hset.activate','prov.google','prov.stripe','prov.amend']
    .every(k => new RegExp("'"+k.replace('.','\\.')+"':'\\w+'").test(src)) &&
  ["'Hotels':'building'","'Whole system':'layers'","'Team & records':'users'","'Account':'user'","'Hotel':'building'","'Connections':'swap'","'Records':'clip'","'Hotel Setup':'building'"].every(f => src.includes(f)));

T('Company / Agency logos are a column right in the one All companies & agents list (no separate table above it any more) - Credit limit was dropped to make room, and listEditor gained a reusable "logo" column type (upload/remove, saved at once, not waiting for the main Save button) for this',
  !src.includes("const logoBox=document.createElement('div')") && !src.includes('Company / Agency logos</h3>') &&
  src.includes("{k:'logo',h:'Logo',type:'logo',") && !src.includes("{k:'creditLimit',h:'Credit limit',type:'number',w:'110px'}") &&
  src.includes("c.type==='logo'?`<div class=\"row gap\" style=\"align-items:center\">${r[c.k]?`<img src=\"${r[c.k]}\" class=\"chb chblogo\" alt=\"\">`:''}<label class=\"btn sm ghost\">${ic('upload',12)}<input type=\"file\" accept=\"image/*\" data-logoup=\"${i}\" data-logok=\"${c.k}\" hidden></label>") &&
  src.includes("onUpload:(r,url)=>{const c=H.companies.find(x=>x.id===r.id);if(!c){toast('Save this row first, then add its logo.');return false}c.logo=url;") &&
  src.includes("onRemove:r=>{const c=H.companies.find(x=>x.id===r.id);if(!c)return;delete c.logo;"));

T('the Non-VAT toggle (Charge codes) gets a real dark-mode colour instead of staying light-mode white',
  src.includes('html[data-skin="modern"][data-mode=dark] .tog{background:color-mix(in srgb,var(--a1) 8%,var(--m-card));color:var(--m-ink);border-color:#ffffff22}'));

T('Rooms and Room totals are one Hotel Setup page now (hset.rooms covers both, each with its own subtitle), not two separate subtitles - Room totals is no longer listed on its own in the Backend sidebar',
  src.includes("VIEWS['hset.rooms']=el=>{") && src.includes("box.insertAdjacentHTML('beforeend','<h3 style=\"margin-top:0\">Room list</h3>');") && src.includes("box.insertAdjacentHTML('beforeend','<h3 class=\"mt\">Room totals</h3>');") &&
  src.includes("return [{t:'Hotel Setup',items:SET_SECTIONS.filter(([k])=>k!=='allot').map(([k,num,title])=>[title,'hset.'+k])},"));

T('the Setup Floor plan editor\'s room/facility tiles are rounded with a shadow, matching the Frontend Housekeeping Status floor plan look, instead of the old flat sharp-edged boxes',
  src.includes('.fpi{position:absolute;box-sizing:border-box;border:2px solid #eceff1;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.3);'));

T('the User Details & Permission list shows the Active/Inactive/Cancelled chip and the access term on one horizontal line, not stacked',
  src.includes('.pptbl td .uat{display:inline-block!important;margin:0 0 0 8px!important;vertical-align:middle}'));

T('Hotels list was folded into Hotels (one title, not two) - the merged table keeps a row number, the Chain/Subscription/Locked-through columns, drops the Open shifts column, and puts Open hotel right beside Action (no Setup fraction, no Close Day shortcut); the Active/Not active chip (.hst) gets a real dark-mode colour too',
  src.includes("<td>${i+1}</td><td><b>${h.code}</b></td><td>${esc(h.set.name)}</td><td data-chain=\"${h.code}\">") &&
  src.includes("<button class=\"btn sm gold\" data-open=\"${h.code}\">Open hotel</button> <button type=\"button\" class=\"btn sm ghost\" data-pvact=\"${h.code}\"") &&
  src.includes('html[data-skin="modern"][data-mode=dark] .hst.on{background:#16a34a2e;color:#4ade80}') &&
  src.includes('html[data-skin="modern"][data-mode=dark] .hst.off{background:#e11d4833;color:#fb7185}'));

T('Chain / Group box (Hotel profile and the Chains/Groups page) is a plain drop-down plus a Save chain button sitting right beside it, on one line - no "+ New chain..." option baked into the drop-down any more; creating a chain lives only on the Chains/Groups page (chainListPanel\'s own New chain / group button), and every chain created there is what fills this drop-down',
  src.includes('${fld(\'Chain / Group\',`<div class="row gap"><select id="chSel" style="flex:1"><option value="">None (stand-alone hotel)</option>${info.chains.map(c=>opt(c.chain_code,chainLabel(c),cur?cur.chain_code:\'\')).join(\'\')}</select><button class="btn" id="chGo">Save chain</button></div>`)}') &&
  !src.includes('<option value="__new">+ New chain...</option>') && !src.includes("if(sel==='__new')") &&
  src.includes("$('#chNew',el).onclick=()=>newChainForm(async()=>{await ChainInfo.load(true);if(after)after();else chainListPanel(el)})"));

T('Hotels List is one flat sidebar entry, not a group with a single nested subtitle - no title/subtitle double layer; it still highlights when open and still works in the hidden classic menubar build (no crash on a group with no items array)',
  src.includes("if(m.flat){groups.push({t:m.t,flat:m.flat});return}") &&
  src.includes(':g.flat\n    ?`<div class="mg"><button type="button" class="mgb" data-go="${esc(g.flat)}" title="${esc(g.t)}">${mIc(MG_ICON[g.t]||\'folder\')}<span>${esc(g.t)}</span></button></div>`') &&
  src.includes("if(m.flat)return `<button class=\"mtop\" data-go=\"${esc(m.flat)}\">${esc(m.t)}</button>`;") &&
  src.includes("$$('.mg>.mgb[data-go]',nav).forEach(b=>{const on=b.dataset.go===VIEW") &&
  src.includes('.mgb.on{background:linear-gradient(90deg,var(--a1),color-mix(in srgb,var(--a1) 65%,var(--a2)));color:#fff;box-shadow:0 6px 16px color-mix(in srgb,var(--a1) 45%,transparent)}'));

T('City Ledger invoice terms moved from Registration card & invoice to Tax Invoice Reference - it is about what prints on a tax invoice, not the registration card',
  !/docs\(box\)\{[\s\S]*?clTermsEditor/.test(src.slice(src.indexOf(' docs(box){'), src.indexOf(' tiref(box){'))) &&
  /tiref\(box\)\{[\s\S]*?clTermsEditor\(clBox\)/.test(src.slice(src.indexOf(' tiref(box){'), src.indexOf(' terms(box){'))));

T('Sign-in and the idle lock screen stay light, never the Dark theme, even though skinIsModern() is now unconditional - both strip data-skin/data-mode/data-pal off <html> directly instead of going through applySkin() (which would just put the user\'s Dark preference straight back)',
  src.includes("function showLogin(msg){\n  /* no one is signed in: the sign-in page keeps its own light look, never the Dark theme - skinIsModern() is\n     unconditional now, so drop the attributes directly instead of going through applySkin() */\n  try{document.documentElement.removeAttribute('data-skin');document.documentElement.removeAttribute('data-mode');document.documentElement.removeAttribute('data-pal')}catch(e){}") &&
  src.includes("try{document.documentElement.removeAttribute('data-skin');document.documentElement.removeAttribute('data-mode');document.documentElement.removeAttribute('data-pal')}catch(e){}\n  const d=document.createElement('div');d.id='idleLock';d.className='idlelock';") &&
  src.includes("d.remove();try{applySkin()}catch(e){}armIdle()};"));

T('The sign-in form (is-signin) never goes dark, whatever the stored Light/Dark preference - the Light/Dark switch inside the login box itself is also hidden there, since it would have nothing to do',
  src.includes("${(!lgOpen&&lgDark())?' eco-dk':''}") &&
  src.includes('<button type="button" class="eco-mode" id="lgMode2" aria-label="Switch Light and Dark" hidden></button>'));

T('Hotels (prov.home) is the provider\'s main landing page, so it never shows a Back button, whatever the nav stack happens to hold',
  src.includes("el.innerHTML=pageHead('Hotels','',undefined,true)+`"));

T('Booking / Reservation detail panel text is smaller throughout (header and every body section), not just the header strip',
  src.includes('.bkp-h small{') && /\.bkp-h small\{[^}]*font-size:10\.5px/.test(src) &&
  /\.bkp-h h2\{[^}]*font-size:14px/.test(src) &&
  /\.bkp-chip\{[^}]*font:700 9\.5px/.test(src) &&
  /\.bkp-c h3\{[^}]*font-size:13px/.test(src) &&
  /\.bkp-kv\{[^}]*font-size:11\.5px/.test(src) &&
  /\.bkp-d b\{[^}]*font-size:12px/.test(src) &&
  /\.bkp-n\{[^}]*font-size:10px/.test(src) &&
  /\.bkp-pay\{[^}]*font-size:11px/.test(src) &&
  /\.bkp-sent\{[^}]*font-size:10\.5px/.test(src));

T('Hotel Settings (hotel-staff Backend) and Hotel profile (provider\'s Hotel Setup, section 1 / hset.profile) are the same form - one renderer, not two pages that could drift apart',
  src.includes("VIEWS['set.hotel']=el=>{el.innerHTML=pageHead('Hotel Settings')+'<div id=\"hsBox\"></div>';SEC_BARE=true;SEC.profile($('#hsBox',el))};") &&
  src.includes(' profile(box){const s=H.set,prov=!!(user().provider||user().isProv),E=prov||can(\'setup\'),d=E?\'\':\'disabled\';') &&
  src.includes("fld('Check-in time',`<input id=\"p_ci\"") && src.includes("fld('Country',`<input id=\"p_country\"") &&
  src.includes('<h3>Breakfast and auto-lock</h3>') && src.includes('id="chBox"'));

T('switching to Backend lands the provider (inside a hotel) on Hotel profile, and hotel staff on Hotel Settings - the same merged form either way',
  src.includes("function firstBackendView(){if(DB.session&&DB.session.provider)return 'hset.profile';"));

T('native form controls (text inputs, scrollbars) default to light even when the browser/OS itself is set to Dark - without this, the lock screen, sign-in and Select Property pages looked part-Dark (dark input boxes) even after their own data-skin/data-mode/data-pal were stripped off <html>, because nothing had told the browser the page itself is light',
  /html\{color-scheme:light\}/.test(src) &&
  src.indexOf('html{color-scheme:light}')<src.indexOf('html[data-skin="modern"][data-mode=dark]{color-scheme:dark;'));

T('Backend > Hotel Billing is two clear blocks (subscription, then the billing ledger) - each person\'s own access term is admin\'d under People & access already, so it is not repeated here',
  src.includes("el.innerHTML=pageHead('Hotel Billing',provHotelPicker())+`<div class=\"panel pad\" id=\"pbSub\"></div><div class=\"panel pad mt\" id=\"pbRec\"></div>`;") &&
  src.includes("bindPicker(el);provSubCard($('#pbSub',el),h);provBillRecords($('#pbRec',el),h);recurringAutoInvoice(h)};") &&
  !/VIEWS\['prov\.billing'\]=el=>\{[\s\S]{0,400}userAccessAdmin/.test(src));

T('a Tax Invoice added from Backend > Hotel Billing gets the same auto-generated gapless number as everywhere else, never one typed by hand - only editing an already-numbered invoice still shows it (disabled)',
  src.includes('const e=row||{},st=PB_STATUS[kind],sub=kind===\'subscription\',inv=kind===\'invoice\';') &&
  src.includes('${inv||row?\'disabled\':\'autofocus\'} ${inv&&!row?\'placeholder="Given automatically (TIV-TH2026/11/001)"\':\'\'}') &&
  src.includes("const body={kind,...(inv&&!row?{}:{no}),") &&
  src.includes("let gotNo=no;if(row)await ctx.call('maha_billing_docs?id=eq.'+row.id,{method:'PATCH',body:JSON.stringify(body)});else{const made=await ctx.call('maha_billing_docs',{method:'POST',body:JSON.stringify(Object.assign({property_id:ctx.pid},body))});gotNo=(made&&made[0]&&made[0].no)||no}"));

T('a .scroll panel (Rate codes, Charge codes, Companies & agents, and every other admin table wider than its panel) really scrolls sideways in the Modern skin, instead of being silently clipped to nothing - a .panel:has(>table) rule meant to round off a table\'s corners was overriding it with no scrollbar at all',
  src.includes('html[data-skin="modern"] .panel:has(>table):not(.scroll),html[data-skin="modern"] .panel:has(>.ph):not(.scroll){overflow:hidden}'));

T('Direct booking & Google is renamed Direct Booking Engine everywhere (menus and page titles), and its amenities list covers a lot more of what a property can actually have, not just the original ten',
  src.includes("{t:'Connections',items:[['Direct Booking Engine','prov.google']") &&
  src.includes("box.innerHTML=secHead('Direct Booking Engine',") &&
  src.includes("el.innerHTML=pageHead('Direct Booking Engine',provHotelPicker())") &&
  src.includes("{k:'google',t:'Direct Booking Engine metadata'") &&
  ['front_desk','bar','room_service','business_center','meeting_room','elevator','non_smoking_rooms','family_rooms','laundry','concierge','luggage_storage','currency_exchange','ev_charging','kids_club','sauna','kitchen','balcony','beachfront','tour_desk','atm','bbq','garden','heating','accessible_facilities'].every(a=>src.includes("'"+a+"'")));

T('Amendment Records and Amendment Log are their own Records group inside a hotel\'s Provider menu, not bundled in with Direct Booking Engine / Stripe payments / Back to provider console; both names are now parallel (Amendment Records, Amendment Log) everywhere, not the old mismatched "Amend records"',
  src.includes("const PROV_HOTEL_RECORDS_GROUP={t:'Records',items:[['Amendment Records','prov.amend'],['Amendment Log','prov.log']]};") &&
  src.includes("people,{t:'Billing',items:[['Hotel Billing','prov.billing']]},PROV_HOTEL_RECORDS_GROUP,PROV_HOTEL_GROUP]}") &&
  src.includes("el.innerHTML=pageHead('Amendment Records',") &&
  (src.match(/\['Amendment Records','prov\.amend'\]/g) || []).length === 2);

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
