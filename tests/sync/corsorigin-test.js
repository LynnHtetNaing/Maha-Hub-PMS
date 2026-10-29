/* The three cloud functions answer the page that asked, when its address is on the list (maha-hub.com, www, pms). Anything else gets the main address.
     node tests/sync/corsorigin-test.js ecosystem/index.html */
const fs=require('fs');let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
for(const n of ['username-auth','tenant-cloud','platform-admin-provision']){
  const s=fs.readFileSync('supabase/functions/'+n+'/index.ts','utf8');
  const a=s.indexOf('const ALLOWED_ORIGINS'),b=s.indexOf('const handle = async');
  if(a<0||b<0){T(n+': wrapper present',false);continue}
  const js=s.slice(a,b).replace(/: Request/g,'').replace(/: Response/g,'');
  const run=(envVal,origin)=>{const Deno={env:{get:k=>k==='MAHA_ALLOWED_ORIGIN'?envVal:undefined}};
    const f=new Function('Deno','Headers','Response',js+';return withOrigin;')(Deno,Headers,Response);
    const res=f({headers:{get:()=>origin}},new Response('x',{status:200}));return res.headers.get('Access-Control-Allow-Origin')};
  T(n+': pms address is answered',run('', 'https://pms.maha-hub.com')==='https://pms.maha-hub.com');
  T(n+': main address is answered',run('', 'https://maha-hub.com')==='https://maha-hub.com');
  T(n+': a stranger gets the main address, not itself',run('', 'https://evil.example')==='https://maha-hub.com');
  T(n+': an old single-address setting still works and pms stays allowed',run('https://maha-hub.com','https://pms.maha-hub.com')==='https://pms.maha-hub.com');
  T(n+': serve goes through the wrapper',/Deno\.serve\(async \(req\) => withOrigin\(req, await handle\(req\)\)\);/.test(s));
}
console.log(fails?'FAILED '+fails:'all ok');process.exit(fails?1:0)
