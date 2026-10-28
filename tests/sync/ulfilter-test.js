const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const i=src.indexOf('function userLogsPage('),j=src.indexOf("VIEWS['set.userlogs']",i);const b=src.slice(i,j);
// the person filter lists usernames (that is what the lines hold) and searches every spelling
if(!b.includes("opt(u.username,(u.name||u.username)+' ('+u.username+')',UL.user)"))fail('filter values must be usernames');
if(!b.includes('user:ulWho(UL.user)'))fail('page must search username and written name');
if(!src.includes('const keep=(x,title,user)=>(!title||x.t===title)&&(!user||(Array.isArray(user)?user.includes(x.user):x.user===user));'))fail('device filter must accept a list');
if(!src.includes('async function queryOne(o){'))fail('merge of spellings');
// Excel is an icon button beside Search, no second row, no shaded bar
const gi=b.indexOf('id="ulGo"'),xi=b.indexOf('id="ulXl"');if(!(gi>0&&xi>gi&&xi-gi<200))fail('Excel beside Search');
if(/id="ulXl">Excel/.test(b))fail('Excel must be an icon');
if(!/\.ufbar\{background:transparent!important/.test(src))fail('shade under the filters');
console.log('ul filter ok');
