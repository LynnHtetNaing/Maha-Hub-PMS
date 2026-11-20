const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8').replace(/\r\n/g,'\n');
const fail=m=>{console.error('FAIL',m);process.exit(1)};
const checks=[
  [src.includes("requested==='book'&&(!onSplitHost()||hostRole()==='main')"),'Booking login selection survives refresh on the Solutions host'],
  [src.includes("if(typeof hostRole==='function'&&hostRole()==='main'){const u=new URL(location.href);if(kind==='book')u.searchParams.set('system','book')"),'Booking selection is written to the Solutions URL'],
  [src.includes("if(lgTargetSys==='book'||(location.hostname||'').toLowerCase().startsWith('booking.')){$('#lgExtra').hidden=true"),'Booking sign-in hides PMS shift and opening cash controls'],
  [src.includes("VIEWS['prov.systems']=el=>{"),'Provider Systems screen exists'],
  [src.includes("const hotels=Object.values(DB.hotels||{}).filter(h=>h&&h.code&&h.active!==false)"),'Systems screen lists all active hotels, not only the selected workspace hotel'],
  [src.includes("data-sysmatrix")&&src.includes("h.set.systems.pms=on")&&src.includes("h.set.google.enabled=on"),'PMS and Booking have independent per-hotel on/off switches'],
  [src.includes("data-sysusers")&&src.includes("go('prov.perms')"),'Systems screen links directly to each hotel user management page'],
  [src.includes("data-sysbook")&&src.includes("go('prov.be.profile')"),'Systems screen links directly to Booking Engine setup'],
  [!src.includes('Build and test the apps (provider only)'),'Provider-only Build and test section is removed from Systems'],
  [src.includes("function pmsOn(h)")&&src.includes("h.set.bookingOnly===true)h.set.systems.pms=false"),'Booking-only properties keep PMS closed'],
  [src.includes("productMode==='booking_only'")&&src.includes("h.set.google.enabled=false"),'Provider can create a Booking-only property without opening an empty public engine'],
  [src.includes("Set the Booking Engine Title before opening Maha Booking"),'Booking-only properties cannot be published before their Booking Engine Title is set'],
  [src.includes("['profile','0','Booking Engine Title']")&&src.includes("id=\"beTitle\""),'Booking Engine Title is configurable in the provider console'],
  [src.includes("['Room Types','hset.types']")&&src.includes("['Rooms & Inventory','hset.rooms']")&&src.includes("['Rates & Rate Plans','hset.rates']"),'Standalone Booking setup exposes room types, inventory and rates without requiring PMS access']
];
for(const [ok,name] of checks){if(!ok)fail(name);console.log('PASS',name)}
console.log('all ok');
