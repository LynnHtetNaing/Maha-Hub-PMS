/* The data added in this round of work still travels to the cloud and to a second device:
   user systems (Sales closed), deleted / cancelled people, position, department, no-shift,
   the hotel system switches, the one-time Sales migration flag. Uses the same fake server as engine-test.js. */
const fs=require('fs'),path=require('path');
const et=fs.readFileSync(path.join(__dirname,'engine-test.js'),'utf8');
const head=et.slice(0,et.indexOf('(async()=>{'));
const lib=new Function('require','process',head+'\nreturn {makeServer,device,open,T,same,strip,getFails:()=>fails};')(require,process);
const {makeServer,device,open,T,same,strip,getFails}=lib;

const hotel=()=>({code:'H1',set:{name:'Hotel One',bd:'2026-10-09',nextRsv:1201,nextInv:101,nextInternal:3100,nextSys:5200,nextProfile:300,
    systems:{reach:false,connect:false,sales:false},google:{enabled:false},_salesUserMig:1,_sysClosedMig:1,_sysClosedMig2:1},
  rooms:[{no:'101',type:'STD',hk:'clean'}],guests:[],reservations:[],invoices:[],amend:[],audits:[],logs:[],pettyFloat:0,
  users:[
    {id:'u1',username:'owner',name:'Owner',role:'Manager',owner:true,protected:true,hash:'HASH',salt:'SALT',perms:['res.create'],systems:{hub:true,connect:true,book:true,reach:true,sales:false}},
    {id:'u2',username:'peach',name:'Lynn',role:'Front desk',position:'Guest Service Agent',department:'Front Office',noShift:true,hash:'HASH2',salt:'SALT2',perms:['res.create','res.edit'],systems:{hub:true,connect:true,book:true,reach:true,sales:false}},
    {id:'u3',username:'old',name:'Old Staff',role:'Front desk',hash:'HASH3',salt:'SALT3',perms:[],systems:{hub:true,connect:true,book:true,reach:true,sales:false}}]});

(async()=>{
  const S=makeServer();
  const A=device(S,'A');A.api.getDB().hotels.H1=hotel();A.sync.reset('H1','pid');
  T('A first copy',await A.sync.firstCopy()===true);
  const raw=JSON.stringify([...S.recs.values()]);
  T('no password hash or salt reaches the cloud',!/HASH|SALT/.test(raw));
  T('user records hold systems, position, department and no-shift',/"sales":false/.test(raw)&&/Guest Service Agent/.test(raw)&&/Front Office/.test(raw)&&/"noShift":true/.test(raw));
  T('hotel switches and the Sales migration flag are in the cloud',S.recs.has('$set\u0001systems')&&S.recs.has('$set\u0001_salesUserMig')&&S.recs.has('$set\u0001google'));

  const B=device(S,'B');B.api.getDB().hotels={};
  await open(B,'H1','pid');
  const hb=B.api.getDB().hotels.H1;
  T('a new device gets the same users, systems and switches',hb&&same(strip(hb),strip(A.api.getDB().hotels.H1))&&hb.users.find(u=>u.username==='peach').systems.sales===false&&hb.set.systems.sales===false);

  /* provider opens Sales for the hotel and for Peach, cancels then deletes Old Staff */
  const ha=A.api.getDB().hotels.H1;
  ha.set.systems.sales=true;
  ha.users.find(u=>u.username==='peach').systems.sales=true;
  const old=ha.users.find(u=>u.username==='old');old.active=false;old.cancelled={at:5,by:'Provider',reason:'Resigned'};old.deleted={at:6,by:'Provider'};
  ha.set.google.enabled=true;
  await A.sync.syncOnce();await B.sync.syncOnce();
  const hb2=B.api.getDB().hotels.H1;
  T('hotel Sales switch reaches the other device',hb2.set.systems.sales===true&&hb2.set.google.enabled===true);
  T('Peach has Sales on the other device',hb2.users.find(u=>u.username==='peach').systems.sales===true);
  const o2=hb2.users.find(u=>u.username==='old');
  T('a deleted person stays as a record (cancelled + deleted) on the other device',!!o2&&!!o2.cancelled&&!!o2.deleted&&o2.deleted.by==='Provider');

  /* closing it again travels back */
  B.api.getDB().hotels.H1.set.systems.sales=false;
  B.api.getDB().hotels.H1.users.find(u=>u.username==='peach').systems.sales=false;
  await B.sync.syncOnce();await A.sync.syncOnce();
  T('closing Sales on one device closes it on the other',A.api.getDB().hotels.H1.set.systems.sales===false&&A.api.getDB().hotels.H1.users.find(u=>u.username==='peach').systems.sales===false);
  T('no conflicts reported',A.sync.conflicts.length===0&&B.sync.conflicts.length===0);
  const f=getFails();console.log(f?('\n'+f+' FAILED'):'\nALL PASSED');process.exit(f?1:0);
})().catch(e=>{console.log('ERR',e&&e.stack||e);process.exit(1)});
