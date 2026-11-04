/* Every system has its own address and nothing is redirected: worker routing, the app's address logic and the sign-in hand-over.
     node tests/sync/pmshost-test.js ecosystem/index.html */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
(async()=>{
const W=(await import(require('url').pathToFileURL(path.resolve('workers/maha-hub-pms/src/index.js')).href)).default;
const ASSETS={fetch:async r=>new Response('asset:'+new URL(r.url).pathname,{headers:{'content-type':'text/html'}})};
const call=(u,env)=>W.fetch(new Request(u,{redirect:'manual'}),Object.assign({ASSETS},env||{}));
const ON={MAIN_HOST:'solutions.maha-hub.com',PMS_HOST:'pms.maha-hub.com',CRM_HOST:'crm.maha-hub.com',CONSOLE_HOST:'console.maha-hub.com',CONNECT_HOST:'',REACH_HOST:'',BOOK_HOST:''};
let r=await call('https://solutions.maha-hub.com/',ON);T('Main address: / is the Main page, no redirect',r.status===200&&(await r.text())==='asset:/ecosystem/');
r=await call('https://pms.maha-hub.com/',ON);T('PMS address: / is the PMS, no redirect',r.status===200&&(await r.text())==='asset:/ecosystem/');
r=await call('https://console.maha-hub.com/?x=1',ON);T('Provider console address: / opens the app, no redirect',r.status===200&&(await r.text())==='asset:/ecosystem/');
r=await call('https://crm.maha-hub.com/',ON);T('Company Sales address: / is the company Sales, no redirect',r.status===200&&(await r.text())==='asset:/crm/index.html');
r=await call('https://crm.maha-hub.com/crm/app.js',ON);T('Company Sales files load on its address',(await r.text())==='asset:/crm/app.js');
r=await call('https://crm.maha-hub.com/signin',ON);T('Company Sales address: /signin is the sign-in page, no redirect',r.status===200&&(await r.text())==='asset:/ecosystem/');
r=await call('https://pms.maha-hub.com/brand/maha/pms-icon-192.png',ON);T('pictures and files still load',(await r.text())==='asset:/brand/maha/pms-icon-192.png');
for(const [h,p] of [['pms.maha-hub.com','/solutions'],['pms.maha-hub.com','/solutions-PMS'],['solutions.maha-hub.com','/ecosystem/Sales/'],['crm.maha-hub.com','/solutions']]){
  r=await call('https://'+h+p,ON);T('old paths are not served on '+h+p+' (404, not a redirect)',r.status===404);}
r=await call('https://connect.maha-hub.com/',ON);T('an address that is switched off (empty setting) is just the website files',(await r.text())==='asset:/');
r=await call('https://maha-hub.com/solutions',ON);T('the website address keeps the old paths (test copies and previews work)',(await r.text())==='asset:/ecosystem/');
r=await call('https://maha-hub.com/',ON);T('the website address / is a file, no redirect',r.status===200);
for(const f of ['wrangler.toml','workers/maha-hub-pms/wrangler.toml']){const w=fs.readFileSync(f,'utf8');
  T(f+': the addresses are set and PMS_REDIRECT is gone',/MAIN_HOST = "solutions\.maha-hub\.com"/.test(w)&&/PMS_HOST = "pms\.maha-hub\.com"/.test(w)&&/CRM_HOST = "crm\.maha-hub\.com"/.test(w)&&/CONSOLE_HOST = "console\.maha-hub\.com"/.test(w)&&!/PMS_REDIRECT/.test(w));}
/* app */
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('code not found: '+a);return src.slice(i,j)};
const code=cut('const SYS_HOSTS=','function edcPack'),sg=cut('function sysSegment','\n');
const mk=(host,pathname,session)=>{const store={},sess={},loc={origin:'https://'+host,hostname:host,pathname,href:'https://'+host+pathname,assigned:null,hash:''};
  const ls={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const ss={getItem:k=>k in sess?sess[k]:null,setItem:(k,v)=>{sess[k]=String(v)},removeItem:k=>{delete sess[k]}};
  const env={location:loc,history:{replaceState(){}},document:{title:'',querySelectorAll:()=>[]},URL,localStorage:ls,sessionStorage:ss,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),unescape,escape,encodeURIComponent,decodeURIComponent,JSON,Date,
    DB:{session:session||null},H:null,SESSKEY:'mahahub.sess',SBAUTHKEY:'mahahub.sbauth',loginStore:()=>ss,RELEASED_SYSTEMS:['hub'],isOwnerSession:()=>!!(session&&session.provider)};
  const api=new Function('env','with(env){'+sg+'\n'+code+'\nreturn {hostRole,onSplitHost,mainUrl,sysUrl,sysFromPath,takeHandover,handoverHash,applySysPath};}')(env);
  return Object.assign(api,{store,sess,loc,env})};
let e=mk('solutions.maha-hub.com','/');T('Main address: role is main, no system',e.hostRole()==='main'&&e.sysFromPath()===null&&e.onSplitHost());
e=mk('pms.maha-hub.com','/');T('PMS address: the page is the PMS',e.hostRole()==='hub'&&e.sysFromPath()==='hub');
e=mk('console.maha-hub.com','/');T('console address: role console, no chooser',e.hostRole()==='console'&&e.sysFromPath()===null);
e=mk('maha-hub.pages.dev','/solutions');T('a test copy keeps the old paths',!e.onSplitHost()&&e.sysUrl('hub',{code:'PAD01'})==='https://maha-hub.pages.dev/solutions-PMS?hotel=PAD01');
e=mk('solutions.maha-hub.com','/');T('Main page links: PMS goes to pms., Sales to sales.',e.sysUrl('hub',null)==='https://pms.maha-hub.com/'&&e.sysUrl('sales',null)==='https://sales.maha-hub.com/');
T('Main address is mainUrl()',mk('pms.maha-hub.com','/').mainUrl()==='https://solutions.maha-hub.com/');
e=mk('pms.maha-hub.com','/',{hotel:'PAD01',provider:true});
e.env.sessionStorage.setItem('mahahub.sess',JSON.stringify({hotel:'PAD01',provider:true}));e.env.sessionStorage.setItem('mahahub.sbauth','{"access_token":"a","refresh_token":"r"}');
const u=e.sysUrl('crm',{code:'PAD01'});
T('the Provider console opens the company Sales on crm. with a hand-over in the # part',u.startsWith('https://crm.maha-hub.com/?hotel=PAD01#mh=')&&!u.split('#')[0].includes('mh='));
const h=u.split('#mh=')[1];
const o=JSON.parse(decodeURIComponent(escape(Buffer.from(h.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('binary'))));
T('the hand-over carries the sign-in and the Sales ticket',JSON.parse(o.s).hotel==='PAD01'&&o.a.includes('access_token')&&JSON.parse(o.e.crm).owner===true);
T('the company Sales gets the access token only, never the refresh token',JSON.parse(o.a).access_token==='a'&&!('refresh_token' in JSON.parse(o.a)));
T('the PMS link carries the sign-in too, with its refresh token',(()=>{const u2=e.sysUrl('hub',{code:'PAD01'}),h2=u2.split('#mh=')[1],o2=JSON.parse(decodeURIComponent(escape(Buffer.from(h2.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('binary'))));return JSON.parse(o2.a).refresh_token==='r'})());
/* the receiving PMS page */
const r2=mk('pms.maha-hub.com','/');r2.env.sessionStorage.setItem('maha.handover',JSON.stringify(o));r2.takeHandover();
T('the next page takes the hand-over once: sign-in and ticket are saved, the parcel is cleared',JSON.parse(r2.sess['mahahub.sess']).hotel==='PAD01'&&r2.sess['mahahub.sbauth'].includes('access_token')&&!!r2.store['mahahub.entry.crm']&&!('maha.handover' in r2.sess));
const n=mk('pms.maha-hub.com','/',null);T('nobody signed in: no hand-over is made',n.sysUrl('crm',{code:'X'}).indexOf('#mh=')===-1);
T('hand-over junk is ignored (only plain keys are written)',(()=>{const x=mk('pms.maha-hub.com','/');x.env.sessionStorage.setItem('maha.handover',JSON.stringify({e:{'../x':'1',ok:'2'}}));x.takeHandover();return !('mahahub.entry.../x' in x.store)&&x.store['mahahub.entry.ok']==='2'})());
/* pages */
T('the app takes the hand-over before it reads the saved sign-in',/function applyLiveSession\(\)\{\r?\n  if\(!DB\)return;\r?\n  takeHandover\(\);/.test(src));
T('the page keeps the # hand-over out of the address bar at once',src.includes("history.replaceState(null,'',location.pathname+location.search);sessionStorage.setItem('maha.handover'"));
T('on the Main address a pick opens that system address',src.includes("if(hostRole()==='main'){location.assign(sysUrl(b.dataset.sys,null));return}"));
T('Sales address /signin is the Sales sign-in',src.includes("r==='hub'||r==='sales'||r==='connect'||r==='book'||r==='reach'?r:null"));
T('a system not open for the person is refused right after the password, no code and no other system',src.includes("is not open for your account.';return}   /* no code, no other system: just not allowed */"));
T('the provider address refuses hotel staff',src.includes("This address is for the provider only."));
T('the console address is the provider sign-in',src.includes("if(hostRole()==='console'||hostRole()==='crm')lgProvider=true;"));
for(const f of ['crm','connect','reach','book']){const p=fs.readFileSync(f+'/index.html','utf8');
  T(f+': takes the hand-over, and a visitor not signed in goes to /signin on the same address',p.includes("var hm=/^#mh=")&&p.includes("?'/signin':'/solutions'"))}
for(const f of ['platform-admin-provision','tenant-cloud','username-auth']){const p=fs.readFileSync('supabase/functions/'+f+'/index.ts','utf8');
  T(f+': answers every system address',['solutions','pms','crm','console'].every(s=>p.includes('https://'+s+'.maha-hub.com')));}
console.log(fails?'FAILED '+fails:'all ok');process.exit(fails?1:0)})().catch(e=>{console.log('FAIL '+e.stack);process.exit(1)});
