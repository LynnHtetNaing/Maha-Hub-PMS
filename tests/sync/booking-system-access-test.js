const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.error('FAIL',m);process.exit(1)};
const checks=[
  [src.includes("requested==='book'&&(!onSplitHost()||hostRole()==='main')"),'Booking login selection survives refresh on the Solutions host'],
  [src.includes("if(typeof hostRole==='function'&&hostRole()==='main'){const u=new URL(location.href);if(kind==='book')u.searchParams.set('system','book')"),'Booking selection is written to the Solutions URL'],
  [src.includes("if(lgTargetSys==='book'||(location.hostname||'').toLowerCase().startsWith('booking.')){$('#lgExtra').hidden=true"),'Booking sign-in hides PMS shift and opening cash controls'],
  [src.includes("VIEWS['prov.systems']=el=>{"),'Provider Systems screen exists'],
  [src.includes("['Systems','prov.systems']"),'Provider console exposes Systems navigation'],
  [src.includes("data-book")&&src.includes("h.set.google.enabled=nv;"),'Maha Booking can be opened and closed per hotel'],
  [src.includes("data-sys-toggle=\"'+k+'\"")&&src.includes("k==='connect'?connectOn(h)")&&src.includes("else if(k==='connect')h.set.systems.connect=nv;"),'Maha Connect can be opened and closed per hotel'],
  [src.includes("data-reach")&&src.includes("h.set.systems.reach=nv;"),'Maha Reach can be opened and closed per hotel'],
  [src.includes("data-saleshotel")&&src.includes("h.set.systems.sales=nv;"),'Maha Sales state remains separately controlled'],
  [src.includes('saveDB();render();toast('),'System changes are saved and the Systems page refreshes']
];
for(const [ok,name] of checks){if(!ok)fail(name);console.log('PASS',name)}
