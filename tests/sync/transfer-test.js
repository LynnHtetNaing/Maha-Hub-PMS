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
{const s4=fs.readFileSync(process.argv[2],'utf8');
 if(!s4.includes('<div class="ucmpbar"><button type="button" class="btn ghost" id="ppCmp">← Users</button><h2 class="ucmptitle">Overview</h2></div>'))fail('Overview header: button and title in their own bar');
 if(!s4.includes('.ucmpbar{display:flex;align-items:center;gap:16px;margin:8px 0 16px}'))fail('Overview header: room between button, title and text');
 console.log('overview header ok');}
{const s5=fs.readFileSync(process.argv[2],'utf8');
 if(!s5.includes("['Approvals','set.approve','approve','fn.set.approve']"))fail('Approvals in the menu needs the Approve permission');
 if(!s5.includes("(x[0]!=='set.approve'||canApprove())"))fail('Approvals shortcut needs the Approve permission');
 if(!s5.includes("VIEWS['set.approve']=el=>{\n  if(!canApprove()")&&!s5.includes("VIEWS['set.approve']=el=>{\r\n  if(!canApprove()"))fail('Approvals page refuses people without the permission');
 console.log('approvals access ok');}
{const s6=fs.readFileSync(process.argv[2],'utf8');
 if(!s6.includes('function applyMoveLines(B,T,lines,pf,by,note)'))fail('one shared move for the pop-up and for an approved request');
 if(!s6.includes('data-sc="folio" aria-pressed="false">Whole folio'))fail('transfer: whole folio option');
 if(s6.includes("allBookings().filter(b=>b.status==='inhouse'&&b.id!==B.id&&match(b,q,k))"))fail('transfer: this room must be searchable too');
 if(!s6.includes("(this room)")||!s6.includes("disabled title=\"This is the folio the lines are on now\""))fail('transfer: same room, other folio only');
 if(!s6.includes("const asReq=!can('move')&&reqFlowOn();"))fail('transfer: people without the permission send a request when the hotel allows it');
 if(!s6.includes("if(ap.action==='move'){const T=bookingById(ap.toId)"))fail('an approved transfer request is applied');
 if(!s6.includes("moveToRoom(B,curLine(),reopen,actNow())"))fail('the toolbar button passes the active folio');
 console.log('transfer folio + request ok');}
{const s7=fs.readFileSync(process.argv[2],'utf8');
 if(!s7.includes('function approvalWatch()')||!s7.includes('setInterval(approvalWatch,10000);'))fail('approvers are told about waiting requests without reloading');
 if(!s7.includes("'New approval request: '"))fail('a message when a new request arrives');
 console.log('approval alert ok');}
