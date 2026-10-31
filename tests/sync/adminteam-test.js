/* Admin team, Admin logs and the Housekeeping Status room order.
     node tests/sync/adminteam-test.js ecosystem/index.html */
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
T('menu: Admin team and Admin logs exist',src.includes("['Admin team','prov.team']")&&src.includes("['Admin logs','prov.adminlogs']"));
T('menu hides them from everyone but the Master',src.includes("MASTER_VIEWS.includes(it[1])")&&/function provMaster\(\)\{[^}]*MahaAuth\.on\(\)\)return true;return _provMaster===true/.test(src));
T('pages refuse non-master admins',src.includes('Only the Master admin opens this page.'));
T('admin lines go to the cloud with the real name (server side), queue per sign-in',src.includes("'maha_admin_logs_push'")&&src.includes('x.u===u'));
T('an admin\'s work inside a hotel is also logged for the admin',src.includes('ALOG.add(H.code,t||ulTitle(a)'));
T('times use this computer clock (no fixed zone)',/const alWhen=ms=>\{try\{return new Intl\.DateTimeFormat\('en-GB',\{day/.test(src)&&!/alWhen[^;]*timeZone/.test(src));
const mg=fs.readFileSync('supabase/migrations/20261030120000_admin_team.sql','utf8');
T('migration: one Master, protected from delete/off',/maha_platform_admins_one_master/.test(mg)&&/master-admin-protected/.test(mg)&&/maha_guard_master_admin_trg/.test(mg));
T('migration: switched-off admin is not a platform admin',/maha_is_platform_admin[\s\S]*a\.active/.test(mg));
T('migration: logs readable by Master only, name taken from the sign-in',/maha_admin_logs_pull[\s\S]*maha_is_master_admin\(\)/.test(mg)&&/select i\.username into uname/.test(mg));
T('migration: new functions are not callable by anon',/revoke all on function public\.maha_admin_logs_push\(jsonb\) from public, anon/.test(mg)&&/revoke all on function public\.maha_provision_admin[^;]*from public, anon, authenticated/.test(mg));
const fn=fs.readFileSync('supabase/functions/platform-admin-provision/index.ts','utf8');
T('function: every action is Master only',/if \(!isMaster\) return respond\(\{ error: "master_only" \}, 403\)/.test(fn));
T('function: switching off bans the sign-in',/action === "admin_set_active"[\s\S]*ban_duration: active \? "none" : "876000h"/.test(fn));
T('function: the Master cannot be changed',fn.includes('master_protected'));
/* Housekeeping Status order */
const a=src.indexOf('function hkRoomOrder('),b=src.indexOf('\n',a);
const ord=new Function(src.slice(a,b)+';return hkRoomOrder')();
const rooms=[{no:'1004'},{no:'1010'},{no:'1002'},{no:'1001',order:2},{no:'1003',order:1},{no:'1009'}];
T('ordered rooms first (smallest first), the rest by room number 1,2,...10',rooms.slice().sort(ord).map(r=>r.no).join(' ')==='1003 1001 1002 1004 1009 1010',rooms.slice().sort(ord).map(r=>r.no).join(' '));
T('no order set: natural number order',[{no:'10'},{no:'9'},{no:'1'}].sort(ord).map(r=>r.no).join(' ')==='1 9 10');
T('dashboard uses the order and Rooms setup has the Order column',src.includes('.sort((x,y)=>hkRoomOrder(x.rm,y.rm))')&&src.includes("{k:'order',h:'Order on dashboard',type:'number'"));
T('provider sign-in: when the Master check finishes the menu is redrawn and the current page is drawn again (no blank page)',src.includes('_provMaster=m;try{renderShell();render()}catch(e){}'));
process.exit(fails?1:0);
