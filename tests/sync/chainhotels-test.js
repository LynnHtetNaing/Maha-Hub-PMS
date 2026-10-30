/* Your Chain Hotels: the sidebar button, the pop-up table, who gets Switch, and the (not yet applied) migration.
     node tests/sync/chainhotels-test.js ecosystem/index.html */
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
T('sidebar box has the Your Chain Hotels button',/<div class="msb-prop">[^`]*<button type="button" class="msb-chain" id="msbChain" hidden>Your Chain Hotels<\/button>/.test(src));
T('old profile-menu Switch hotel entry is gone',!src.includes('data-act="switch">Switch hotel')&&!src.includes("a==='switch'"));
T('pop-up columns',/<th>Country<\/th><th>Property ID<\/th><th>Property name<\/th><th>Location<\/th><th>Phone<\/th>/.test(src));
T('You are here + Close + modal x',src.includes('You are here')&&src.includes('data-chclose')&&src.includes("modal('Your Chain Hotels'"));
const a=src.indexOf('function chainRowsMerge('),b=src.indexOf('async function chainHotelData(',a);
T('merge function found',a>0&&b>a);
const chainRowsMerge=new Function(src.slice(a,b)+';return chainRowsMerge')();
const rows=[{code:'B',country:'Thailand',open:true},{code:'A',country:'Thailand',open:true},{code:'C',country:'Thailand',open:false},{code:'M',country:'Myanmar',open:true},{code:'Z',country:'',open:true}];
let r=chainRowsMerge(rows,null,false,{noShift:true},'A').rows;
T('sorted by country then id; no country last',r.map(x=>x.code).join('')==='MABCZ',r.map(x=>x.code).join(''));
T('no-shift person: Switch only where open and not current',r.filter(x=>x.canSwitch).map(x=>x.code).join('')==='MBZ');
T('current row marked',r.find(x=>x.code==='A').current===true);
r=chainRowsMerge(rows,null,false,{shiftId:'s1'},'A').rows;
T('person with a real shift: no Switch at all',!r.some(x=>x.canSwitch));
r=chainRowsMerge(rows,null,true,{provider:true},'A').rows;
T('provider: Switch where the hotel can be opened',r.filter(x=>x.canSwitch).map(x=>x.code).join('')==='MBZ');
T('stand-alone hotel: one line, no Switch',(()=>{const x=chainRowsMerge([{code:'A',open:true}],null,false,{noShift:true},'A').rows;return x.length===1&&!x[0].canSwitch&&x[0].current})());
T('data comes from the server list, then the hotel file; degrades without the migration',src.includes("'maha_chain_hotels'")&&src.includes('loadPropertyList()')&&src.includes("'maha_set_property_info'"));
const mg=fs.readFileSync('supabase/migrations/20261030100000_chain_hotels_list.sql','utf8');
T('migration: columns, two functions, no anon, authenticated only',/add column if not exists country/.test(mg)&&/function public\.maha_chain_hotels/.test(mg)&&/function public\.maha_set_property_info/.test(mg)&&/revoke all on function public\.maha_chain_hotels\(\) from public, anon/.test(mg)&&/grant execute on function public\.maha_chain_hotels\(\) to authenticated/.test(mg));
T('migration: only hotels not in the recycle bin, access flag from maha_can_access_property',/deleted_at is null/.test(mg)&&/maha_can_access_property\(p\.id\)/.test(mg));
T('button hidden until the hotel is known to be in a chain',/id="msbChain" hidden>/.test(src)&&src.includes('chainBtnSync();')&&src.includes('b.hidden=!_chainOf[H.code]'));
process.exit(fails?1:0);
