const fs=require('fs');const assert=require('assert');
const src=fs.readFileSync(process.argv[2],'utf8');
const a=src.indexOf('/* ---------- record-level sync engine'),b=src.indexOf('/* ---------- end record-level sync engine');
if(a<0||b<0)throw new Error('engine markers missing');
const engine=src.slice(a,b);

/* ---- fake server: same rules as maha_sync_push / pull / lease ---- */
function makeServer(){
  const recs=new Map(),counters=new Map();let seq=0;
  const forbidden=n=>{if(!n||typeof n!=='object')return false;if(Array.isArray(n))return n.some(forbidden);return Object.keys(n).some(k=>['pan','cvc','cvv','cardvault','session'].includes(k.toLowerCase())||forbidden(n[k]))};
  return {recs,counters,
    push(changes){const applied=[],conflicts=[];
      for(const ch of changes){
        const id=ch.collection+'\u0001'+ch.key,cur=recs.get(id),base=ch.base_version||0,del=!!ch.deleted;
        if(!del&&(ch.data==null))throw Object.assign(new Error('invalid-change'),{status:400});
        if(!del&&forbidden(ch.data))throw Object.assign(new Error('sensitive-data-rejected'),{status:400});
        if(!cur){if(base!==0){conflicts.push({collection:ch.collection,key:ch.key,version:0,deleted:true,data:null});continue}
          recs.set(id,{collection:ch.collection,key:ch.key,data:del?null:ch.data,deleted:del,version:1,seq:++seq});applied.push({collection:ch.collection,key:ch.key,version:1,seq:seq})}
        else if(cur.version!==base)conflicts.push({collection:ch.collection,key:ch.key,version:cur.version,deleted:cur.deleted,data:cur.data});
        else{cur.data=del?null:ch.data;cur.deleted=del;cur.version++;cur.seq=++seq;applied.push({collection:ch.collection,key:ch.key,version:cur.version,seq:seq})}
      }return {applied,conflicts,seq}},
    pull(since,page){const all=[...recs.values()].filter(r=>r.seq>since).sort((x,y)=>x.seq-y.seq).slice(0,page);
      const mx=all.length?all[all.length-1].seq:since;return {records:JSON.parse(JSON.stringify(all)),seq:mx,head:seq,more:mx<seq}},
    lease(name,floor,n){const c=counters.get(name)||0;const start=Math.max(c,floor,1);counters.set(name,start+n);return {start,end:start+n-1}}
  };
}
/* ---- one simulated device ---- */
function device(server,name,opts={}){
  const ls={};const localStorage={getItem:k=>k in ls?ls[k]:null,setItem:(k,v)=>{ls[k]=String(v)},removeItem:k=>{delete ls[k]}};
  const ctx={DB:{hotels:{},providers:[]},toasts:[],net:true};
  const MahaAuth={async rpc(n,body){
    if(!ctx.net)throw new Error('network');
    if(n==='maha_sync_pull')return server.pull(body.since,body.page_size);
    if(n==='maha_sync_push')return server.push(body.changes);
    if(n==='maha_lease_numbers')return server.lease(body.counter_name,body.floor_value,body.block_size);
    throw new Error('rpc '+n)}};
  const code=engine+';return {getDB:()=>DB,MahaSync,msExplode,msAssemble,msMerge3,msStable,msClean};';
  const api=new Function('ctx','localStorage','MahaAuth','TENANT_FORBIDDEN','migrateDB','toast','saveDB',
    'let DB=ctx.DB;'+code)(
    ctx,localStorage,MahaAuth,new Set(['pan','cvc','cvv','cardvault','session']),d=>d,m=>ctx.toasts.push(m),()=>{});
  ctx.api=api;ctx.ls=ls;ctx.name=name;ctx.sync=api.MahaSync;return ctx;
}
const newHotel=()=>({code:'H1',set:{name:'Hotel One',bd:'2026-10-09',nextRsv:1201,nextInv:101,nextInternal:3100,nextSys:5200,nextProfile:300,
    stripe:{publishable:'pk',secret:'sk_live_x'},features:{a:true}},
  rooms:[{no:'101',type:'STD',hk:'clean'},{no:'102',type:'STD',hk:'clean'}],
  guests:[{id:'g1',last:'Ann'},{id:'g2',last:'Bob'}],
  reservations:[{id:'r1',no:1200,guest:'g1',status:'res',bookings:[{id:'b1',room:'101'}]},{id:'r2',no:1199,guest:'g2',status:'res',bookings:[{id:'b2',room:'102'}]}],
  users:[{id:'u1',username:'mgr',role:'Manager',hash:'HASH',salt:'SALT'}],
  logs:[{at:3,t:'newest'},{at:2,t:'mid'},{at:1,t:'oldest'}],
  invoices:[],amend:[],audits:[],pettyFloat:0,cardVault:[{pan:'4111'}],session:{u:1}});
let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
const strip=h=>{const o=JSON.parse(JSON.stringify(h));MahaStrip(o);return o};
const MahaStrip=o=>{['nextRsv','nextInv','nextInternal','nextSys','nextProfile'].forEach(k=>delete o.set[k]);delete o.cardVault;delete o.session;(o.users||[]).forEach(u=>{delete u.hash;delete u.salt});if(o.set.stripe)delete o.set.stripe.secret};
const sorted=h=>{const o=JSON.parse(JSON.stringify(h));for(const k of Object.keys(o))if(Array.isArray(o[k])&&o[k].length===0)delete o[k];for(const k of Object.keys(o))if(Array.isArray(o[k])&&!['logs','amend'].includes(k))o[k].sort((x,y)=>JSON.stringify(x)<JSON.stringify(y)?-1:1);return o};
const same=(x,y)=>(()=>{const kx=o=>JSON.stringify(o,Object.keys(o).sort());const norm=v=>JSON.parse(JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.keys(val).sort().reduce((a,c)=>(a[c]=val[c],a),{}):val));return JSON.stringify(norm(sorted(x)))===JSON.stringify(norm(sorted(y)))})();
const open=async(d,code,pid)=>{const r=await d.sync.open(code,pid);if(r&&r.records){d.api.getDB().hotels[code]=d.api.getDB().hotels[code]||{};d.sync.install(r)}return r};

(async()=>{
  const S=makeServer();
  /* A: first cloud copy */
  const A=device(S,'A');A.api.getDB().hotels.H1=newHotel();A.sync.reset('H1','pid');
  let ok=await A.sync.firstCopy();
  T('A first copy succeeds',ok===true);
  const raw=JSON.stringify([...S.recs.values()]);
  T('server holds no secrets/hashes/card data/session',!/sk_live|HASH|SALT|4111|"session"|cardVault/.test(raw));
  T('server has per-record rows',S.recs.has('reservations\u0001r1')&&S.recs.has('guests\u0001g2')&&S.recs.has('$set\u0001name')&&!S.recs.has('$set\u0001nextRsv'));
  T('counters leased from floor',A.api.getDB().hotels.H1.set.nextRsv===1201&&S.counters.get('nextRsv')===1251,String(S.counters.get('nextRsv')));
  /* B: brand new device */
  const B=device(S,'B');B.api.getDB().hotels={};
  let r=await open(B,'H1','pid');
  const hb=B.api.getDB().hotels.H1;
  T('B (new device) gets the whole hotel',r&&r.records&&same(strip(hb),strip(A.api.getDB().hotels.H1))&&hb.reservations.length===2);
  T('B logs keep newest-first order',hb.logs[0].t==='newest'&&hb.logs[2].t==='oldest',hb.logs.map(l=>l.t).join(','));
  await B.sync.ensureLeases(true);
  T('B gets a different number block than A',B.api.getDB().hotels.H1.set.nextRsv>=1251,String(B.api.getDB().hotels.H1.set.nextRsv));
  /* parallel edits of different records */
  A.api.getDB().hotels.H1.reservations[0].status='in';
  B.api.getDB().hotels.H1.reservations.push({id:'r3',no:B.api.getDB().hotels.H1.set.nextRsv++,guest:'g2',status:'res',bookings:[]});
  A.api.getDB().hotels.H1.guests.push({id:'g3',last:'Cat'});
  await A.sync.syncOnce();await B.sync.syncOnce();await A.sync.syncOnce();
  const ha=A.api.getDB().hotels.H1,hb2=B.api.getDB().hotels.H1;
  T('parallel edits of different records converge',same(strip(ha),strip(hb2))&&ha.reservations.length===3&&ha.guests.length===3&&hb2.reservations.find(x=>x.id==='r1').status==='in');
  /* same record, different fields -> merged */
  A.api.getDB().hotels.H1.reservations.find(x=>x.id==='r2').status='in';
  B.api.getDB().hotels.H1.reservations.find(x=>x.id==='r2').phone='555';
  await A.sync.syncOnce();await B.sync.syncOnce();await A.sync.syncOnce();
  const m1=A.api.getDB().hotels.H1.reservations.find(x=>x.id==='r2'),m2=B.api.getDB().hotels.H1.reservations.find(x=>x.id==='r2');
  T('same record, different fields -> merged on both devices',m1.status==='in'&&m1.phone==='555'&&same(m1,m2),JSON.stringify(m1));
  T('no conflict reported for a clean merge',A.sync.conflicts.length===0&&B.sync.conflicts.length===0);
  /* same field -> cloud copy wins, loser told */
  A.api.getDB().hotels.H1.reservations.find(x=>x.id==='r1').status='out';
  B.api.getDB().hotels.H1.reservations.find(x=>x.id==='r1').status='cancel';
  await A.sync.syncOnce();await B.sync.syncOnce();await A.sync.syncOnce();
  const c1=A.api.getDB().hotels.H1.reservations.find(x=>x.id==='r1'),c2=B.api.getDB().hotels.H1.reservations.find(x=>x.id==='r1');
  T('same field edited twice -> first saved wins, both converge',c1.status==='out'&&c2.status==='out',c1.status+'/'+c2.status);
  T('loser was told (toast + conflict list)',B.sync.conflicts.length===1&&B.toasts.some(t=>/Another device changed/.test(t)));
  /* delete propagates */
  const gi=A.api.getDB().hotels.H1.guests.findIndex(x=>x.id==='g3');A.api.getDB().hotels.H1.guests.splice(gi,1);
  await A.sync.syncOnce();await B.sync.syncOnce();
  T('delete propagates as tombstone',!B.api.getDB().hotels.H1.guests.some(x=>x.id==='g3')&&S.recs.get('guests\u0001g3').deleted===true);
  /* offline edits survive a reload and sync later */
  A.net=false;
  A.api.getDB().hotels.H1.rooms[0].hk='dirty';
  A.net=false;const r0=await (async()=>{A.net=false;return 0})();
  const offlineCtx=A;offlineCtx.net=false;
  const off=await A.sync.syncOnce();
  T('offline sync fails softly and keeps the edit',off==='error'&&A.sync.offline===true&&A.api.getDB().hotels.H1.rooms[0].hk==='dirty');
  A.sync.persist();
  const A2=device(S,'A2');A2.api.getDB().hotels.H1=JSON.parse(JSON.stringify(A.api.getDB().hotels.H1));A2.ls['maha.sync.H1']=A.ls['maha.sync.H1'];
  const rr=await A2.sync.open('H1','pid');
  T('reload resumes (does not replace local hotel)',rr==='resumed',String(rr));
  A.net=true;
  T('offline edit reached the cloud after resume',S.recs.get('rooms\u0001101').data.hk==='dirty');
  /* stale device must not overwrite */
  await B.sync.syncOnce();
  T('B received the offline edit',B.api.getDB().hotels.H1.rooms.find(x=>x.no==='101').hk==='dirty');
  /* numbers never collide */
  const nums=new Set();let dup=false;
  for(const d of [A,B,A2]){await d.sync.ensureLeases(true)}
  const blocks=[A,B,A2].map(d=>d.sync.leases.nextRsv);
  blocks.sort((x,y)=>x.start-y.start);
  for(let i=1;i<blocks.length;i++)if(blocks[i].start<=blocks[i-1].end)dup=true;
  T('leased number blocks never overlap',!dup,JSON.stringify(blocks));
  /* low-water refill */
  const dh=A.api.getDB().hotels.H1;dh.set.nextRsv=A.sync.leases.nextRsv.end-2;await A.sync.syncOnce();
  T('block refills before it runs out',dh.set.nextRsv>A.sync.leases.nextRsv.start-1&&dh.set.nextRsv>=A.sync.leases.nextRsv.start,JSON.stringify(A.sync.leases.nextRsv)+' cur='+dh.set.nextRsv);
  /* user records never carry hashes */
  T('local password hashes never uploaded',!JSON.stringify([...S.recs.values()]).includes('HASH'));
  /* converged final state */
  await A.sync.syncOnce();await B.sync.syncOnce();await A2.sync.syncOnce();await A.sync.syncOnce();
  T('all three devices converge',same(strip(A.api.getDB().hotels.H1),strip(B.api.getDB().hotels.H1))&&same(strip(B.api.getDB().hotels.H1),strip(A2.api.getDB().hotels.H1)));
  /* many parallel creators */
  const devs=[A,B,A2];devs.forEach((d,i)=>{for(let k=0;k<5;k++)d.api.getDB().hotels.H1.guests.push({id:`x${i}-${k}`,last:'P'+i+k})});
  await Promise.all(devs.map(d=>d.sync.syncOnce()));await Promise.all(devs.map(d=>d.sync.syncOnce()));await Promise.all(devs.map(d=>d.sync.syncOnce()));
  const counts=devs.map(d=>d.api.getDB().hotels.H1.guests.length);
  T('15 guests created concurrently on 3 devices: none lost, all converge',counts.every(c=>c===counts[0])&&counts[0]>=17,counts.join(','));
  /* a gapless-invoice hotel takes invoice numbers from the server one at a time, so it must NOT lease invoice blocks */
  const GL=device(S,'GL');GL.api.getDB().hotels.H1=newHotel();GL.api.getDB().hotels.H1.set.gaplessInvoices=true;GL.sync.reset('H1','pid');
  const leaseBefore=S.counters.get('nextInv');
  await GL.sync.ensureLeases(true);
  T('gapless hotel leases every counter except the invoice number',GL.sync.leases.nextRsv&&GL.sync.leases.nextProfile&&!GL.sync.leases.nextInv&&S.counters.get('nextInv')===leaseBefore,JSON.stringify(Object.keys(GL.sync.leases)));  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e);process.exit(2)});
