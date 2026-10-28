const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const must=(m,c)=>{if(!c)fail(m)};
// the Select Property / Select System pages stay on screen until the person chooses
must('flag exists','let SEL_ON=false;'&&src.includes('let SEL_ON=false;'));
must('the pages switch the flag on',src.includes('function selShell(inner){SEL_ON=true;'));
must('render() ignores background redraws while a Select page is open',src.includes("function render(){\n  if(!DB.session){showLogin();return}\n  if(SEL_ON)return;")||src.includes("function render(){\r\n  if(!DB.session){showLogin();return}\r\n  if(SEL_ON)return;"));
must('renderShell() ignores them too',/function renderShell\(\)\{\r?\n  if\(SEL_ON\)return;/.test(src));
must('the flag is switched off when a choice is made',src.includes('const a=await selectSystemPage(H,multi);SEL_ON=false;')&&src.includes('const code=await selectPropertyPage(props,current,canCancel);SEL_ON=false;'));
must('the flag is always cleared (finally) so the screen can never stay blocked',src.includes('}}finally{SEL_ON=false}'));
must('sign out clears it',src.includes("$('#spOut').onclick=()=>{SEL_ON=false;signOut(true)}"));
// loading screens show the gate alone
must('loading screens use the plain gate',(src.match(/<img src="\/brand\/maha\/gate-small\.png" alt="" width="58" height="54">/g)||[]).length===2);
console.log('selflow ok');
