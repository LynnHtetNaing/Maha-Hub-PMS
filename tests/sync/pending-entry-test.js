/* A reload on the pages before a system (subscription notice, property, Frontend / Backend) must come back to those pages, not open the system.
     node tests/sync/pending-entry-test.js ecosystem/index.html */
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok)=>{console.log((ok?'PASS ':'FAIL ')+n);if(!ok)fails++};
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('code not found: '+a);return src.slice(i,j)};
/* the marker itself works and is tab-only */
const store={};const st={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};const loginStore=()=>st,dropLogin=k=>{delete store[k]};
const api=new Function('loginStore','dropLogin',cut("const PEND_KEY=","async function signOut")+';return {setPending,clearPending,getPending}')(loginStore,dropLogin);
T('nothing is pending at first',api.getPending()===null);
api.setPending({who:'owner',shift:'Day'});T('the marker keeps who signed in and the shift',api.getPending().who==='owner'&&api.getPending().shift==='Day');
api.clearPending();T('clearing removes it',api.getPending()===null);
T('the marker is kept exactly where the sign-in is kept (this tab on a computer, the device for the app)',src.includes('function setPending(v){try{loginStore().setItem(PEND_KEY')&&src.includes('function clearPending(){dropLogin(PEND_KEY)}'));
/* it is set when sign-in succeeds and removed when the system opens or the person signs out */
T('set when the sign-in flow starts',/setPending\(\{who,shift\}\);\s*try\{\s*let props=\[\],nextP;/.test(src));
T('set for the Subscription ended page too',src.includes('setPending({block:true});SUB_BLOCK=true;subBlockScreen(h)'));
T('removed the moment the system opens',src.includes("clearPending();applySysPath('hub');renderShell();{const r=routeStart(curArea()==='back'"));
T('removed on sign out',/async function signOut\(silent,msg\)\{[^]*?clearPending\(\);/.test(src));
/* start-up: a reload with the marker goes back to the choosing pages */
const fin=cut("const finish=()=>{","const doneBoot");
T('start-up checks the marker before opening the system',fin.indexOf('getPending()')>0&&fin.indexOf('getPending()')<fin.indexOf("applySysPath(DB.session.provider&&!DB.session.inHotel?null:'hub')"));
T('a reload restarts the Subscription ended / notice / property / Frontend-Backend pages',fin.includes('afterLoginRoute(H,pend.who')&&fin.includes('subBlockScreen(H)'));
T('nothing draws the system behind the loading screen while the choosing pages are made',fin.includes('SEL_ON=true;afterLoginRoute(H,pend.who'));
T('provider sessions are not affected',fin.includes('pend&&!DB.session.provider'));
console.log(fails?fails+' FAILED':'ALL PASSED');process.exit(fails?1:0);
