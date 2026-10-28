const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const i=src.indexOf("const PP={q:"),j=src.indexOf("VIEWS['prov.amend']=el=>{",i);
if(i<0||j<0)fail('staff page not found');
const b=src.slice(i,j);
// the page: slim list, one person's page, compare table
for(const m of ['id="ppTb"','data-ppopen','data-ppmore','data-pptab="people"','data-pptab="compare"','data-ppsub="perms"','id="ppFind"','ppmat'])if(!b.includes(m))fail('missing '+m);
// Open / Locked buttons, not on/off switches
if(!/class="tog sm '\+\(on\?'on':''\)\+'" data-pu=/.test(b))fail('permissions must use the Open / Locked buttons');
if(!b.includes("(on?'Open':'Locked')"))fail('Open / Locked text');
if(/type="checkbox"[^>]*data-pu/.test(b))fail('permissions must not be checkboxes or switches');
// every existing action is kept
for(const k of ['data-ns','data-ce','data-pos','data-dept','data-su','data-pu','data-term','data-cancel','data-pre','data-rp','data-act'])if(!b.includes("$$('["+k+"]',root)"))fail('action not kept: '+k);
// the menu has the same actions, the owner cannot be cancelled
for(const m of ['Change email','Reset password','Access term','Apply preset','Deactivate','Cancel user'])if(!b.includes(m))fail('menu entry '+m);
if(!b.includes("const prot=u.owner||u.protected;"))fail('the owner stays protected');
// a cancelled person is a record with one button
if(!b.includes('Restore access'))fail('Restore access');
// every permission belongs to a group (new ones go to Other)
if(!b.includes("groups.push(['Other',extra])"))fail('new permissions must still show up');
// the compare table is frozen
if(!/\.ppmat \.pm th:first-child,\.ppmat \.pm td:first-child\{position:sticky;left:0/.test(src))fail('first column must be frozen');
if(!/\.ppmat \.pm tr:first-child th\{position:sticky;top:0/.test(src))fail('header row must be frozen');
// a copied "$$(" must never have turned into "$(" in this block
if(/\n\s*\$\('\[data-[a-z]+\]',root\)\.forEach/.test(b))fail('broken selector copy');
console.log('staff page ok');
