const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('cut '+a);return src.slice(i,j)};
const code=cut('const MAHA_AUTH_CONFIG','function loadDB(){')+'\n'+cut('const TCV_PREFIX','function sessionValid(se){')+'\n'+cut('async function tenantCloudPull','function scheduleCloudPush');

/* ---- fake cloud (same rules as the SQL functions) ---- */
function makeCloud(){
  const recs=new Map(),counters=new Map();let seq=0;
  const accounts={'front.desk':{pw:'pw-ok',uid:'U1',props:[{id:'P-H1',property_code:'H1'}]},
                  'other.user':{pw:'pw-ok',uid:'U2',props:[{id:'P-H2',property_code:'H2'}]},
                  'nohotel':{pw:'pw-ok',uid:'U3',props:[]},
                  'ghost':{pw:'pw-ok',uid:'U4',props:[{id:'P-H1',property_code:'H1'}]},
                  'mahaadmin':{pw:'pw-ok',uid:'UA',admin:true,props:[]}};
  const allProps=[{id:'P-H1',property_code:'H1'},{id:'P-H2',property_code:'H2'}];   /* has access to H1 but is not a staff record in it */
  const byProp=new Map();const store=id=>{if(!byProp.has(id))byProp.set(id,{recs:new Map(),seq:0});return byProp.get(id)};
  const cloud={accounts,allProps,calls:[],down:false,store,
    rpc(uid,name,b){
      const acc=Object.values(accounts).find(a=>a.uid===uid);
      if(name==='maha_is_platform_admin')return acc.admin===true;
      if(!(acc.admin?allProps:acc.props).some(p=>p.id===b.target_property))throw Object.assign(new Error('property-access-denied'),{status:403,code:'42501'});
      const S=store(b.target_property);
      if(name==='maha_sync_pull'){const all=[...S.recs.values()].filter(r=>r.seq>b.since).sort((x,y)=>x.seq-y.seq).slice(0,b.page_size);const mx=all.length?all[all.length-1].seq:b.since;return {records:JSON.parse(JSON.stringify(all)),seq:mx,head:S.seq,more:mx<S.seq}}
      if(name==='maha_sync_push'){const applied=[],conflicts=[];for(const ch of b.changes){const id=ch.collection+'\u0001'+ch.key,cur=S.recs.get(id),base=ch.base_version||0,del=!!ch.deleted;
          if(!cur){if(base!==0){conflicts.push({collection:ch.collection,key:ch.key,version:0,deleted:true,data:null});continue}S.recs.set(id,{collection:ch.collection,key:ch.key,data:del?null:ch.data,deleted:del,version:1,seq:++S.seq});applied.push({collection:ch.collection,key:ch.key,version:1,seq:S.seq})}
          else if(cur.version!==base)conflicts.push({collection:ch.collection,key:ch.key,version:cur.version,deleted:cur.deleted,data:cur.data});
          else{cur.data=del?null:ch.data;cur.deleted=del;cur.version++;cur.seq=++S.seq;applied.push({collection:ch.collection,key:ch.key,version:cur.version,seq:S.seq})}}
        return {applied,conflicts,seq:S.seq}}
      if(name==='maha_lease_numbers'){const k=b.target_property+b.counter_name;const c=counters.get(k)||0;const start=Math.max(c,b.floor_value,1);counters.set(k,start+b.block_size);return {start,end:start+b.block_size-1}}
      throw new Error('rpc '+name)}};
  return cloud;
}
const resp=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
function device(cloud){
  const ls={},ss={};
  const mkStore=o=>({getItem:k=>k in o?o[k]:null,setItem:(k,v)=>{o[k]=String(v)},removeItem:k=>{delete o[k]},key:i=>Object.keys(o)[i],get length(){return Object.keys(o).length}});
  const localStorage=mkStore(ls),sessionStorage=new Proxy(mkStore(ss),{ownKeys:()=>Object.keys(ss),getOwnPropertyDescriptor:(t,k)=>k in ss?{enumerable:true,configurable:true,value:ss[k]}:undefined,get:(t,k)=>k in t?t[k]:ss[k]});
  const ctx={DB:{hotels:{},providers:[{username:'mahaadmin',hash:'SECRET'}]},toasts:[],confirms:[],confirmAnswer:true,backups:0};
  const tokens={};
  const fetch=async(url,opt={})=>{
    if(cloud.down&&/rest\/v1\/rpc/.test(url))return resp(502,{message:'bad gateway'});
    if(/functions\/v1\/username-auth/.test(url)){const b=JSON.parse(opt.body);const a=cloud.accounts[b.username];if(!a||a.pw!==b.password||a.disabled)return resp(401,{error:'invalid_credentials'});const t='tok-'+a.uid;tokens[t]=a.uid;return resp(200,{access_token:t,refresh_token:'r',expires_in:3600,token_type:'bearer',user:{id:a.uid,email:'x@x'}})}
    if(/auth\/v1\/logout/.test(url))return resp(204,null);
    const uid=tokens[(opt.headers&&opt.headers.Authorization||'').replace('Bearer ','')];
    if(!uid)return resp(401,{message:'JWT'});
    const acc=Object.values(cloud.accounts).find(a=>a.uid===uid);
    if(/functions\/v1\/platform-admin-provision/.test(url)){const b=JSON.parse(opt.body);if(!acc.admin)return resp(403,{error:'forbidden'});cloud.calls.push(b.action||'create_hotel');
      if((b.action||'create_hotel')==='create_hotel'){if(cloud.allProps.some(p=>p.property_code===b.property_code))return resp(409,{error:'property_code_taken'});const prop={id:'P-'+b.property_code,property_code:b.property_code};cloud.allProps.push(prop);cloud.accounts[b.username]={pw:'pw-ok',uid:'U-'+b.username,props:[prop]};return resp(201,{ok:true,property_id:prop.id})}
      if(b.action==='set_active'){const t=cloud.accounts[b.username];if(!t)return resp(404,{error:'staff_not_found'});t.disabled=!b.active;return resp(200,{ok:true,active:b.active})}
      if(b.action==='add_staff'){const prop=cloud.allProps.find(p=>p.property_code===b.property_code);if(!prop)return resp(404,{error:'property_not_found'});if(cloud.accounts[b.username])return resp(409,{error:'username_taken'});cloud.accounts[b.username]={pw:'pw-ok',uid:'U-'+b.username,props:[prop]};return resp(201,{ok:true})}
      return resp(400,{error:'unsupported_action'})}
    if(/rest\/v1\/maha_properties/.test(url))return resp(200,acc.admin?cloud.allProps:acc.props);
    const m=url.match(/rest\/v1\/rpc\/(\w+)/);if(m){try{return resp(200,cloud.rpc(uid,m[1],JSON.parse(opt.body)))}catch(e){return resp(e.status||500,{message:e.message,code:e.code})}}
    return resp(404,{});
  };
  const body=`
    const location={hostname:'localhost',search:'?auth=supabase'};const window={addEventListener(){}};
    const document={createElement:()=>{ctx.backups++;return {click(){},remove(){}}},body:{appendChild(){}},hidden:false,activeElement:null};
    let DB=ctx.DB,H=null,_cloudApplying=false,_cloudErrAt=0;
    const toast=m=>ctx.toasts.push(m);const confirm=m=>{ctx.confirms.push(m);return ctx.confirmAnswer};
    const emptyHotel=o=>({code:o.code,set:{name:o.name,cur:o.cur,bd:o.bd,nextRsv:1,nextInv:1,nextInternal:1,nextSys:1,nextProfile:1},users:[],guests:[],reservations:[],rooms:[],roomTypes:[],shifts:[],logs:[]});const shapeHotel=()=>{};const mkUser=(id,username,name,role)=>({id,username,name,role,active:true,hash:'x',salt:'y'});const uid=()=>Math.random().toString(36).slice(2,8);
    const migrateDB=d=>{Object.values(d.hotels||{}).forEach(h=>{if(h&&h.corrupt)throw new Error('cannot migrate');if(!Array.isArray(h.roomTypes))throw new TypeError('Cannot read properties of undefined (reading push)')});return d};const bindHotel=()=>{};const saveDB=()=>{};const renderShell=()=>{};const render=()=>{};
    const iso=d=>d.toISOString().slice(0,10);const supabaseSessionExpired=()=>{};
    ${code}
    ctx.api={MahaAuth,MahaSync,ProvSync,ProvAdmin,getDB:()=>DB,resumeSync};
  `;
  new Function('ctx','localStorage','sessionStorage','URLSearchParams','fetch',body)(ctx,localStorage,sessionStorage,URLSearchParams,fetch);
  ctx.ls=ls;ctx.ss=ss;return ctx;
}
const hotelData=()=>({code:'H1',active:true,set:{name:'Hotel One',bd:'2026-10-09',nextRsv:1201,nextInv:101,nextInternal:3100,nextSys:5200,nextProfile:300},
  users:[{id:'u1',username:'front.desk',role:'Front desk',active:true,hash:'H',salt:'S'}],guests:[{id:'g1',last:'Ann'}],reservations:[{id:'r1',no:1200,status:'res'}],rooms:[{no:'101'}]});
let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
(async()=>{
  const cloud=makeCloud();
  /* 1 wrong password */
  let A=device(cloud);let r=await A.api.MahaAuth.staffSignIn('front.desk','nope');
  T('wrong password -> invalid',!r.ok&&r.reason==='invalid');
  /* 2 no hotel linked */
  r=await A.api.MahaAuth.staffSignIn('nohotel','pw-ok');T('account without hotel -> unlinked',!r.ok&&r.reason==='unlinked'&&A.api.MahaAuth.read()===null,r.reason);
  /* 3 first device with data, cloud empty: confirm + backup + first copy */
  A.ctx=A;A.api.getDB().hotels.H1=hotelData();A.confirmAnswer=false;
  r=await A.api.MahaAuth.staffSignIn('front.desk','pw-ok');
  T('empty cloud + user cancels -> nothing uploaded, signed out',!r.ok&&r.reason==='cancelled'&&cloud.store('P-H1').recs.size===0&&A.api.MahaAuth.read()===null,r.reason);
  A.confirmAnswer=true;A.confirms.length=0;A.backups=0;
  r=await A.api.MahaAuth.staffSignIn('front.desk','pw-ok');
  T('empty cloud + user confirms -> backup downloaded, first copy uploaded',r.ok&&A.backups===1&&cloud.store('P-H1').recs.size>5&&A.confirms.length===1,String(cloud.store('P-H1').recs.size));
  T('polling started after sign-in',!!A.api.MahaSync.poll);A.api.MahaSync.stop();
  /* 4 NEW device, empty storage, same login: loads from cloud, no prompts, no URL/passphrase needed */
  let B=device(cloud);
  r=await B.api.MahaAuth.staffSignIn('front.desk','pw-ok');
  const hb=B.api.getDB().hotels.H1;
  T('new device: username+password only -> hotel loaded from cloud',r.ok&&hb&&hb.reservations[0].id==='r1'&&hb.guests[0].last==='Ann'&&r.u.username==='front.desk',r.ok?'':r.reason);
  T('new device: no confirm prompt, no backup, providers untouched',B.confirms.length===0&&B.backups===0&&B.api.getDB().providers[0].hash==='SECRET');
  T('new device: number block assigned',hb.set.nextRsv>=1251,String(hb.set.nextRsv));
  B.api.MahaSync.stop();
  /* 5 edit on B, sync; A (returning old device) signs in again and catches up */
  hb.reservations[0].status='in';hb.guests.push({id:'g9',last:'New'});await B.api.MahaSync.syncOnce();
  A.api.MahaAuth.signOut();
  r=await A.api.MahaAuth.staffSignIn('front.desk','pw-ok');
  const ha=A.api.getDB().hotels.H1;
  T('returning device: resumes and catches up',r.ok&&ha.reservations[0].status==='in'&&ha.guests.some(g=>g.id==='g9')&&A.confirms.length===1,r.ok?'':r.reason);
  A.api.MahaSync.stop();
  /* 6 cloud unavailable */
  let C=device(cloud);C.api.getDB().hotels.H1={code:'H1',set:{name:'LOCAL ONLY'},users:[{id:'u1',username:'front.desk',active:true}]};cloud.down=true;
  r=await C.api.MahaAuth.staffSignIn('front.desk','pw-ok');cloud.down=false;
  T('cloud unavailable -> sign-in stopped, local data untouched, no token kept',!r.ok&&r.reason==='unavailable'&&C.api.getDB().hotels.H1.set.name==='LOCAL ONLY'&&C.api.MahaAuth.read()===null&&C.confirms.length===0,r.reason);
  /* 7 account has access but is not a staff member in the hotel */
  let D=device(cloud);r=await D.api.MahaAuth.staffSignIn('ghost','pw-ok');
  T('authorized account without a staff record -> not entered, nothing installed',!r.ok&&!D.api.getDB().hotels.H1&&D.api.MahaAuth.read()===null,r.reason);
  /* 8 user of another hotel cannot get H1 */
  let E=device(cloud);r=await E.api.MahaAuth.staffSignIn('other.user','pw-ok');
  T('other hotel user: H1 never loaded',!E.api.getDB().hotels.H1,r.reason);
  /* 9 sign-out clears sync state keys and stops polling */
  B.api.MahaAuth.write(null);T('sign-out clears versions/tokens',Object.keys(B.ss).filter(k=>/^mahahub\.sbauth|^maha\.tcv\./.test(k)).length===0&&!B.api.MahaSync.poll);
  /* 10 two devices working at the same time through the real login path */
  let F=device(cloud),G=device(cloud);
  await F.api.MahaAuth.staffSignIn('front.desk','pw-ok');await G.api.MahaAuth.staffSignIn('front.desk','pw-ok');
  F.api.getDB().hotels.H1.guests.push({id:'gF',last:'F'});G.api.getDB().hotels.H1.guests.push({id:'gG',last:'G'});
  await Promise.all([F.api.MahaSync.syncOnce(),G.api.MahaSync.syncOnce()]);await F.api.MahaSync.syncOnce();await G.api.MahaSync.syncOnce();
  const ids=h=>h.guests.map(g=>g.id).sort().join();
  T('two signed-in devices see each other\'s new records',ids(F.api.getDB().hotels.H1)===ids(G.api.getDB().hotels.H1)&&/gF/.test(ids(G.api.getDB().hotels.H1))&&/gG/.test(ids(F.api.getDB().hotels.H1)),ids(F.api.getDB().hotels.H1));
  /* a cloud copy this version cannot read must be reported as unreadable, never as an outage */
  cloud.accounts['bad.hotel']={pw:'pw-ok',uid:'UB',props:[{id:'P-BAD',property_code:'BAD1'}]};
  cloud.allProps.push({id:'P-BAD',property_code:'BAD1'});
  const sb=cloud.store('P-BAD');[['$obj','code','BAD1'],['$obj','corrupt',true]].forEach(([c,k,v],i)=>sb.recs.set(c+'\u0001'+k,{collection:c,key:k,data:{v},deleted:false,version:1,seq:++sb.seq}));
  sb.recs.set('$set\u0001name',{collection:'$set',key:'name',data:{v:'Bad'},deleted:false,version:1,seq:++sb.seq});
  sb.recs.set('users\u0001u1',{collection:'users',key:'u1',data:{id:'u1',username:'bad.hotel',active:true},deleted:false,version:1,seq:++sb.seq});
  let BD=device(cloud);BD.api.getDB().hotels.BAD1={code:'BAD1',set:{name:'LOCAL KEPT'},users:[]};
  r=await BD.api.MahaAuth.staffSignIn('bad.hotel','pw-ok');
  T('unreadable cloud copy -> clear "invalid-cloud" message (not an outage), local data kept',!r.ok&&r.reason==='invalid-cloud'&&BD.api.getDB().hotels.BAD1.set.name==='LOCAL KEPT'&&BD.api.MahaAuth.read()===null,r.reason);  /* ===== provider (platform owner): signs in through Supabase and keeps every hotel in sync ===== */
  /* H2 gets data from a staff-less seed: the provider opens it empty -> skipped (no local copy), H1 downloads */
  let P=device(cloud);
  r=await P.api.MahaAuth.staffSignIn('mahaadmin','wrong');T('provider wrong password -> invalid',!r.ok&&r.reason==='invalid');
  P.confirmAnswer=false;
  r=await P.api.MahaAuth.staffSignIn('mahaadmin','pw-ok');
  T('provider signs in as provider (not as hotel staff)',r.ok&&r.provider===true&&!r.h,JSON.stringify(r).slice(0,80));
  T('provider has H1 from the cloud; empty H2 skipped without prompt noise',!!P.api.getDB().hotels.H1&&P.api.ProvSync.items.has('H1')&&!P.api.ProvSync.items.has('H2'),[...P.api.ProvSync.items.keys()].join());
  T('provider hotels are remembered for reload',JSON.parse(P.ss['maha.provHotels']).length===1);
  /* provider changes reach hotel staff */
  P.api.getDB().session={provider:true};
  P.api.getDB().hotels.H1.users.push({id:'u2',username:'new.staff',role:'Front desk',active:true});
  P.api.getDB().hotels.H1.set.name='Hotel One (renamed by provider)';
  await P.api.ProvSync.syncAll();
  let S2=device(cloud);cloud.accounts['new.staff']={pw:'pw-ok',uid:'U9',props:[{id:'P-H1',property_code:'H1'}]};
  r=await S2.api.MahaAuth.staffSignIn('new.staff','pw-ok');
  T('staff added by provider can sign in and sees provider edits',r.ok&&S2.api.getDB().hotels.H1.set.name==='Hotel One (renamed by provider)'&&r.u.username==='new.staff',r.ok?'':r.reason);
  S2.api.MahaSync.stop();
  /* staff edit reaches provider */
  S2.api.getDB().hotels.H1.guests.push({id:'gS2',last:'FromStaff'});await S2.api.MahaSync.syncOnce();await P.api.ProvSync.syncAll();
  T('staff edit reaches the provider',P.api.getDB().hotels.H1.guests.some(g=>g.id==='gS2'));
  /* create a hotel + login from the provider panel code path */
  P.api.getDB().hotels.NEW1=undefined;delete P.api.getDB().hotels.NEW1;
  let created=null,cerr=null;try{created=await P.api.ProvAdmin.createHotel({code:'NEW1',name:'New Hotel One',user:'new1.owner',email:'o@x.test',cur:'THB',bd:'2026-10-09'})}catch(e){cerr=e}
  T('create hotel: server account + property created, first copy uploaded',!!created&&cloud.store('P-NEW1').recs.size>3&&P.api.ProvSync.items.has('NEW1'),cerr?cerr.message:String(cloud.store('P-NEW1').recs.size));
  let N=device(cloud);r=await N.api.MahaAuth.staffSignIn('new1.owner','pw-ok');
  T('new hotel owner signs in on a brand-new device with username+password only',r.ok&&N.api.getDB().hotels.NEW1&&r.u.username==='new1.owner',r.ok?'':r.reason);N.api.MahaSync.stop();
  try{await P.api.ProvAdmin.createHotel({code:'NEW1',name:'dup',user:'x.y.z',email:'o@x.test',cur:'THB',bd:'2026-10-09'});T('duplicate hotel code rejected',false)}catch(e){T('duplicate hotel code rejected with a clear message',e.message==='property_code_taken'&&/already used/.test(P.api.ProvAdmin.msg(e)),e.message)}
  /* disable a login: provider -> server; the staff member can no longer sign in */
  await P.api.ProvAdmin.call({action:'set_active',username:'new.staff',active:false});
  let S3=device(cloud);r=await S3.api.MahaAuth.staffSignIn('new.staff','pw-ok');
  T('disabled staff member cannot sign in',!r.ok&&r.reason==='invalid',r.reason);
  await P.api.ProvAdmin.call({action:'set_active',username:'new.staff',active:true});
  r=await S3.api.MahaAuth.staffSignIn('new.staff','pw-ok');T('re-enabled staff member can sign in again',r.ok);S3.api.MahaSync.stop();
  /* a hotel staff account cannot use the provider function */
  const sTok=await S3.api.MahaAuth.fresh();let denied=false;try{await S3.api.ProvAdmin.call({action:'add_staff',property_code:'H1',username:'hack',email:'h@x.test',role:'staff'})}catch(e){denied=e.message==='forbidden'}
  T('hotel staff cannot create accounts (provider function refuses)',denied&&!cloud.accounts.hack);
  /* reload: provider sync resumes from what was saved in the tab */
  const P2=P;P2.api.ProvSync.stop();P2.ss['maha.provHotels']=JSON.stringify([{code:'H1',pid:'P-H1'}]);
  P2.api.getDB().session={provider:true,hotel:'H1'};
  const resumed=P2.api.ProvSync.resume();T('provider sync resumes after a page reload',resumed===true&&P2.api.ProvSync.items.has('H1')&&!!P2.api.ProvSync.poll);
  P2.api.ProvSync.stop();  [A,B,F,G].forEach(d=>d.api.MahaSync.stop());
  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e);process.exit(2)});
;
