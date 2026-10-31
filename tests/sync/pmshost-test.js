/* The PMS's own address (pms.maha-hub.com): worker routing and the app's address logic. Off until launch.
     node tests/sync/pmshost-test.js ecosystem/index.html */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
(async()=>{
const W=(await import(require('url').pathToFileURL(path.resolve('workers/maha-hub-pms/src/index.js')).href)).default;
const ASSETS={fetch:async r=>new Response('asset:'+new URL(r.url).pathname,{headers:{'content-type':'text/html'}})};
const call=(u,env)=>W.fetch(new Request(u,{redirect:'manual'}),Object.assign({ASSETS},env||{}));
const ON={PMS_HOST:'pms.maha-hub.com',MAIN_HOST:'maha-hub.com'};
let r=await call('https://pms.maha-hub.com/',ON);T('pms address / goes to the Main page (choose a system first)',r.status===302&&r.headers.get('location')==='https://pms.maha-hub.com/solutions',r.headers.get('location'));
r=await call('https://pms.maha-hub.com/?source=app',ON);T('the query stays',r.headers.get('location')==='https://pms.maha-hub.com/solutions?source=app');
r=await call('https://pms.maha-hub.com/solutions',ON);T('Main page is served on the pms address',(await r.text())==='asset:/ecosystem/');
r=await call('https://pms.maha-hub.com/solutions-PMS?source=app',ON);T('PMS sign-in is /solutions-PMS on the pms address',(await r.text())==='asset:/ecosystem/');
r=await call('https://pms.maha-hub.com/ecosystem/Sales/',ON);T('Sales is not served here',r.status===302&&r.headers.get('location')==='https://maha-hub.com/ecosystem/Sales/');
r=await call('https://pms.maha-hub.com/brand/maha/pms-icon-192.png',ON);T('pictures and files still load',(await r.text())==='asset:/brand/maha/pms-icon-192.png');
r=await call('https://maha-hub.com/solutions-PMS',ON);T('redirect from the main address is OFF until launch',r.status===200||r.status===404||r.status!==302||false,String(r.status));
r=await call('https://maha-hub.com/solutions-PMS',Object.assign({PMS_REDIRECT:'1'},ON));T('at launch the old PMS path moves to the PMS address',r.status===302&&r.headers.get('location')==='https://pms.maha-hub.com/solutions-PMS',r.headers.get('location'));
r=await call('https://maha-hub.com/solutions',Object.assign({PMS_REDIRECT:'1'},ON));T('the Main page stays on the main address',(await r.text())==='asset:/ecosystem/');
r=await call('https://maha-hub.com/solutions-PMS',{});T('switch empty: nothing changes anywhere',(await r.text())==='asset:/ecosystem/');
r=await call('https://maha-hub.com/',{});T('the main address / is the website home (a file), no redirect',r.status===200);
const rwf='run_worker_first = ["/", "/index.html", "/solutions*"]';T('the worker runs first for / and /solutions only',fs.readFileSync('wrangler.toml','utf8').includes(rwf)&&fs.readFileSync('workers/maha-hub-pms/wrangler.toml','utf8').includes(rwf));
/* app */
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('code not found: '+a);return src.slice(i,j)};
const code=cut('function hubBaseUrl()','function edcB64url'),sg=cut('function sysSegment','\n');
const env=(host,pathname,split)=>{const loc={origin:'https://'+host,hostname:host,pathname,href:'https://'+host+pathname};const hist={to:null,replaceState(a,b,u){this.to=u}};const doc={title:''};
  const cd=code.replace('const PMS_SPLIT_ON=true','const PMS_SPLIT_ON='+!!split);
  const api=new Function('location','history','document','URL','tabTitleFor','setTabIcons',sg+'\n'+cd+'\nreturn {hubBaseUrl,sysFromPath,sysUrl,applySysPath};')(loc,hist,doc,URL,()=>'Maha PMS',()=>{});api.hist=hist;api.doc=doc;return api};
let e=env('pms.maha-hub.com','/solutions');T('on pms. the Main page is not a system',e.sysFromPath()===null);
e=env('pms.maha-hub.com','/solutions-PMS');T('on pms. /solutions-PMS is the PMS',e.sysFromPath()==='hub'&&(e.applySysPath('hub'),e.hist.to===null));
T('PMS link on pms. stays on pms.',e.sysUrl('hub',{code:'PAD01'})==='https://pms.maha-hub.com/solutions-PMS?hotel=PAD01'||e.sysUrl('hub',{code:'PAD01'})==='https://pms.maha-hub.com/solutions-PMS?hotel=PAD01');
e=env('maha-hub.com','/solutions',false);T('switch off: PMS link stays on the main address',e.sysUrl('hub')==='https://maha-hub.com/solutions-PMS'&&e.sysFromPath()===null);
e=env('maha-hub.com','/solutions',true);T('switch on: PMS link goes to pms.',e.sysUrl('hub',{code:'PAD01'})==='https://pms.maha-hub.com/solutions-PMS?hotel=PAD01'&&e.sysUrl('reach')==='https://maha-hub.com/ecosystem/Reach/');
e=env('maha-hub.pages.dev','/solutions',true);T('the test copy keeps the old paths even when switched on',e.sysUrl('hub')==='https://maha-hub.pages.dev/solutions-PMS');
T('pms. counts as a live cloud address',src.includes("liveHosts:['maha-hub.com','www.maha-hub.com','pms.maha-hub.com']"));
T('the switch is ON in this build',/const PMS_SPLIT_ON=true/.test(src));
console.log(fails?'FAILED '+fails:'all ok');process.exit(fails?1:0)})().catch(e=>{console.log('FAIL '+e.stack);process.exit(1)});
