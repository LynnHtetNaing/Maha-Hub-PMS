const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const a=src.indexOf('function moveToRoom('),b=src.indexOf('/* provider: change any field of a line',a);const t=src.slice(a,b);
if(!/<select id="trF"[^>]*>\s*<option value="room" selected>Room#<\/option>/.test(t))fail('Room# is the default filter');
for(const k of ['guest','folio','rsvn','cin','cout','all'])if(!t.includes('<option value="'+k+'"'))fail('filter option '+k);
if(!t.includes("const k=$('#trF',m).value;")||!t.includes('match(b,q,k)'))fail('the search follows the chosen filter');
if(!t.includes("$('#trF',m).onchange="))fail('changing the filter searches again');
if(!/\[data-mode=dark\] #trPick \.fseg button\[aria-pressed=true\]\{background:color-mix/.test(src))fail('the chosen folio is a shaded tile in Dark');
if(/\[data-mode=light\] #trPick/.test(src))fail('Light mode stays as it was');
console.log('transfer pop-up ok');
{const s2=fs.readFileSync(process.argv[2],'utf8');
 if(!s2.includes('<div class="chks nfg">')||!s2.includes("s==='All'?' nfall':''"))fail('notification boxes: grid with All on its own line');
 if(!/\.chks\.nfg\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(s2)||!/\.chks\.nfg \.nfall\{grid-column:1\/-1\}/.test(s2))fail('4 boxes per line, All on a full line');
 if(!s2.includes("$$('.chks input:checked',m)"))fail('saving still reads the ticked boxes');
 console.log('notification boxes ok');}
{const s3=fs.readFileSync(process.argv[2],'utf8');
 if(!s3.includes('.modal.ppmodal .mbody>.btns{margin:0 0 16px!important;padding:4px 2px 0!important'))fail('print preview: air around the Print / Mail row');
 console.log('print preview spacing ok');}
