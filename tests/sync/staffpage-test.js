const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const i=src.indexOf("const PP={q:"),j=src.indexOf("VIEWS['prov.amend']=el=>{",i);
if(i<0||j<0)fail('user page not found');
const b=src.slice(i,j);
// one page for the provider and the hotel (hotel = view only)
if(!b.includes("VIEWS['prov.perms']=el=>usersPage(el,true);"))fail('provider page');
if(!/VIEWS\['set\.users'\]=el=>usersPage\(el,false\);/.test(src))fail('hotel page must be the same page, view only');
if(!b.includes("pageHead('User Details & Permission'"))fail('page name');
// full-width list, click opens a pop-up with the red close button (the normal modal)
for(const m of ['id="ppTb"','data-ppopen','function openUser(','modal(esc(u0.name)',"{w:980}",'id="ppFind"'])if(!b.includes(m))fail('missing '+m);
if(b.includes('data-ppmore')||b.includes('ppMenuHtml'))fail('the 3-dot menu is gone');
// buttons in the agreed order: row 1 and row 2
const r1=b.indexOf('data-ce="'),r1b=b.indexOf('data-rs="',r1),r2=b.indexOf('data-rp="',r1b),r4=b.indexOf('data-term="',r2),r3=b.indexOf('data-prx="',r4),r5=b.indexOf('data-act="',r3),r6=b.indexOf('data-cancel="',r5);
if(!(r1>0&&r1<r1b&&r1b<r2&&r2<r4&&r4<r3&&r3<r5&&r5<r6))fail('button order: Change email, Resend password link, Reset password / Access term, Apply preset, Deactivate, Cancel');
// the pop-up is only permissions: no account buttons inside it
const pop=b.slice(b.indexOf('function ppPopupHtml('),b.indexOf('function cmpHtml('));
for(const k of ['data-ce=','data-rp=','data-prx=','data-term=','data-cancel=','data-udel=','data-act='])if(pop.includes(k))fail('pop-up must only hold permissions, found '+k);
// Open / Locked buttons for the provider, only labels for the hotel
if(!/class="tog sm '\+\(on\?'on':''\)\+'" data-pu=/.test(b))fail('Open / Locked buttons');
if(/type="checkbox"[^>]*data-pu/.test(b))fail('permissions must not be switches');
if(!b.includes("edit?'<button type=\"button\" class=\"tog sm"))fail('hotel side must not get buttons');
// cancelled person: only Re-activate and Delete; delete keeps a record only
if(!b.includes('Re-activate')||!b.includes('data-udel='))fail('cancelled person buttons');
if(!b.includes("t.deleted={at:Date.now()")||!b.includes("'User deleted – '"))fail('delete keeps a record');
if(!b.includes('const ppShown=u=>!u.deleted&&ppMatches(u)'))fail('deleted people leave the list');
// every permission shows (new ones go to Other)
if(!b.includes("groups.push(['Other',extra])"))fail('new permissions must still show up');
// all old actions still bound
for(const k of ['data-ns','data-ce','data-pos','data-dept','data-su','data-pu','data-term','data-cancel','data-rp','data-act'])if(!b.includes("$$('["+k+"]',root)"))fail('action not kept: '+k);
if(/\n\s*\$\('\[data-[a-z]+\]',root\)\.forEach/.test(b))fail('broken selector copy');
// compare page: read-only ticks, names frozen, rounded
if(!b.includes('Nothing can be changed here'))fail('compare is read only');
if(!/\.ppmat \.pm th:first-child,\.ppmat \.pm td:first-child\{position:sticky;left:0/.test(src))fail('first column must be frozen');
if(!/\.ucmp \.panel\{overflow:hidden;border-radius:14px\}/.test(src))fail('rounded corners');
// the old print-preview class .ppwrap must not be restyled
if(/\.ppwrap\{display:grid/.test(src))fail('.ppwrap belongs to the print preview');
// close button turns red on press
if(!/html \.modal \.mx:active\{background:#c0392b/.test(src))fail('red close on press');
console.log('staff page ok');
{const s2=fs.readFileSync(process.argv[2],'utf8');
 if(s2.includes("['AI helpers'"))fail('AI helpers group is gone');
 if(!s2.includes("!/^ai\\./.test(k)")&&!s2.includes("!/^ai\./.test(k)"))fail("AI permissions must not show in Other");
 if(!s2.includes('function ppGroup(name,count,rowsHtml)'))fail('permission groups open and close');
 console.log('groups ok');}
