const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
const a=src.indexOf('const DOC_ROWS_FULL'),b=src.indexOf('function docRowHtml(c)');
const api=new Function(src.slice(a,b)+';return {DOC_ROWS_FULL,DOC_ROWS_LAST,flattenDoc,chunkDoc}')();
const rows=n=>Array.from({length:n},(_,i)=>({desc:'L'+i}));
const sizes=n=>api.chunkDoc(api.flattenDoc(rows(n))).map(p=>p.length);
T('one page up to the last-page capacity',JSON.stringify(sizes(api.DOC_ROWS_LAST))==='['+api.DOC_ROWS_LAST+']'&&JSON.stringify(sizes(1))==='[1]');
for(const n of [6,7,12,18,19,25,40,100]){const p=sizes(n);T(n+' lines: nothing lost, every page within its capacity, the last page fits the totals',p.reduce((x,y)=>x+y,0)===n&&p.slice(0,-1).every(x=>x>=1&&x<=api.DOC_ROWS_FULL)&&p[p.length-1]<=api.DOC_ROWS_LAST&&p[p.length-1]>=1,JSON.stringify(p))}
/* a charge stays with its card / remark rows */
const withExtra=[];for(let i=0;i<9;i++){withExtra.push({desc:'L'+i,card:{last4:'1234'},remark:'r'})}
const pg=api.chunkDoc(api.flattenDoc(withExtra));
T('a line is never separated from its card and remark rows',pg.every(p=>!(p[p.length-1].t==='l')||pg.indexOf(p)===pg.length-1));
/* the totals, the words and the signatures are on the last page only */
T('the totals and the amount in words are drawn on the last page only',src.includes("${isLast?totals:'<div class=\"ivcont\">Continued on the next page</div>'}<div class=\"ivfoot\">"));
T('the disclaimer and the signatures are on EVERY page (the template is fixed)',!src.includes('isLast?`<div class="ivfoot">')&&src.includes("Cashier's Signature<br>"));
T('more room between the disclaimer and the signatures',src.includes('.inv .sigs{margin-top:60px}'));
T('the signatures keep a clear margin above the bottom edge',/\.ppage\.port\.inv\{padding-bottom:20mm!important\}/.test(src));
process.exit(fails?1:0);
