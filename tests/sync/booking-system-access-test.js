const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.error('FAIL',m);process.exit(1)};
const checks=[
  [src.includes("requested==='book'&&(!onSplitHost()||hostRole()==='main')"),'Booking login selection survives refresh on the Solutions host'],
  [src.includes("if(typeof hostRole==='function'&&hostRole()==='main'){const u=new URL(location.href);if(kind==='book')u.searchParams.set('system','book')"),'Booking selection is written to the Solutions URL'],
  [src.includes("if(lgTargetSys==='book'||(location.hostname||'').toLowerCase().startsWith('booking.')){$('#lgExtra').hidden=true"),'Booking sign-in hides PMS shift and opening cash controls'],
  [src.includes("VIEWS['prov.systems']=el=>{"),'Provider Systems screen exists'],
  [src.includes("['Systems & Access','prov.systems']"),'Provider console exposes Systems & Access navigation'],
  [src.includes('data-sys-toggle="${c[0]}" data-code="${esc(h.code)}"')&&src.includes("k==='book'?bookOn(h)")&&src.includes("if(k==='book')h.set.google.enabled=nv;"),'Maha Booking can be opened and closed per hotel'],
  [src.includes("k==='connect'?connectOn(h)")&&src.includes("else if(k==='connect')h.set.systems.connect=nv;"),'Maha Connect can be opened and closed per hotel'],
  [src.includes("k==='reach'?reachOn(h)")&&src.includes("else if(k==='reach')h.set.systems.reach=nv;"),'Maha Reach can be opened and closed per hotel'],
  [src.includes("k==='sales'?salesOn(h)")&&src.includes("else if(k==='sales')h.set.systems.sales=nv;"),'Maha Sales state remains separately controlled'],
  [src.includes("const h=DB.hotels[b.dataset.code];if(h)toggleHotelSystem(h,b.dataset.sysToggle)"),'Each matrix toggle updates the selected hotel and system only'],
  [src.includes("saveDB();render();toast("),'System changes are saved and the Systems page refreshes']
];
for(const [ok,name] of checks){if(!ok)fail(name);console.log('PASS',name)}
