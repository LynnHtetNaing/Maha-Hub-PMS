const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const must=(m,c)=>{if(!c)fail(m)};
const i=src.indexOf('function ulTitle(a){'),j=src.indexOf('const ULOG=(()=>',i);
must('ulTitle found',i>0&&j>i);
eval(src.slice(i,j)+';globalThis.T=ulTitle');
const eq=(msg,want)=>{const got=T(msg);if(got!==want)fail('"'+msg+'" -> '+got+' (want '+want+')')};
// every kind of message the system already writes lands in the right group
eq('Signed in without a shift','Sign in / out');eq('Signed in, continued Morning shift','Sign in / out');eq('Signed out','Sign in / out');eq('Signed out (1 hour without activity)','Sign in / out');
eq('Opened Morning shift','Sign in / out');eq('Switched to another hotel (PAD02)','Sign in / out');
eq('Opened screen Arrivals','Screen');eq('Opened screen Folio (RSVN 1042, room 203)','Screen');
eq('Created RSVN 1042','Reservation');eq('Checked in RSVN 1042 room 203','Reservation');eq('Checked out RSVN 1042 room 203 (vacant dirty)','Reservation');eq('Cancelled RSVN 1042','Reservation');eq('No-show RSVN 1042','Reservation');eq('Recalled no-show RSVN 1042','Reservation');eq('Reinstated RSVN 1042','Reservation');eq('Rate change RSVN 1042','Reservation');eq('Assigned room 203 RSVN 1042','Reservation');eq('Copied RSVN 1042 to 1043','Reservation');eq('Amended RSVN 1042: dates','Reservation');eq('Group created: ABC','Reservation');
eq('Posted Cash 1,500.00 to RSVN 1042 folio 1','Folio & payments');eq('Void payment Cash 500.00 RSVN 1042','Folio & payments');eq('Refund 500.00 Cash RSVN 1042 · reason','Folio & payments');eq('Rebate 100.00 Room RSVN 1042','Folio & payments');eq('Correct post 100 1,300.00 RSVN 1042: wrong','Folio & payments');eq('Moved line 12 to folio 2 RSVN 1042','Folio & payments');eq('Edited line 12 RSVN 1042: amount','Folio & payments');eq('Split line 12 (100.00) into 2 RSVN 1042','Folio & payments');eq('Approved refund 500.00 RSVN 1042','Folio & payments');eq('Credit note CN-1','Folio & payments');eq('Reservation deposit 2,000.00 RSVN 1042','Folio & payments');eq('Supplier bill 2000','Folio & payments');
eq('Close Day 27/10/2026 done','Cashier & Close Day');eq('Post room: 12 room charge(s) posted','Cashier & Close Day');eq('Closed Aye\'s Morning shift, variance 0.00','Cashier & Close Day');eq('Petty cash out 100.00: tips','Cashier & Close Day');eq('Room discrepancy 203 closed: ok','Cashier & Close Day');
eq('Room 203: VC → VD','Rooms & housekeeping');eq('Room 204 set out of order','Rooms & housekeeping');eq('Dummy room D999 removed','Rooms & housekeeping');
eq('Hotel settings saved','Setup & staff');eq('Announcement removed: x','Setup & staff');eq('Duty roster saved','Setup & staff');eq('Approval requested: void','Setup & staff');eq('Added company X','Setup & staff');eq('Saved changes on Rooms & Room Types','Setup & staff');eq('Cancelled user peach','Setup & staff');
eq('Printed registration card RSVN 1042','Print & export');eq('Printed: Guest folio','Print & export');eq('Exported report R1 to Excel (01/10 to 02/10)','Print & export');eq('Downloaded file: x.csv','Print & export');
eq('Tried "Void payment" without permission','Denied');
eq('AI guest reply drafted','Other');eq('Marked announcement as read: x','Other');
// the permission: opened person by person, the owner always has it, no preset gives it away
must('permission is listed',src.includes("PERMS.push(['userlogs','View user logs (User Logs page)']);"));
must('the Manager preset does not include it',src.includes("Manager:PERMS.map(p=>p[0]).filter(p=>p!=='userlogs'),"));
must('the owner always has it',src.includes("(p==='userlogs'&&!!u.owner)"));
must('owners get it in their list too',src.includes("u.perms.push('userlogs')"));
must('the page refuses people without it',src.includes("}else if(!can('userlogs')){"));
// menus
must('Setup menu entry, gated by the permission',src.includes("['User Logs','set.userlogs','userlogs']"));
must('Backend menu entry',src.includes("g('People & access',['set.users','set.userlogs'])"));
must('Provider console entry',src.includes("['User Logs','prov.userlogs']"));
must('both views exist',src.includes("VIEWS['set.userlogs']=")&&src.includes("VIEWS['prov.userlogs']="));
// everything is recorded: existing records, screens, refused attempts, prints, exports, and a safety net
must('every log() also writes a User Logs record',src.includes('_ulLastLog=Date.now();try{ULOG.add(a,ref)}catch(e){}}'));
must('screens are recorded',src.includes('try{ulScreen(v,arg)}catch(e){}'));
must('refused attempts are recorded',src.includes('if(perm&&!can(perm)){ulDenied(perm);'));
must('prints are recorded',src.includes("log('Printed: '+title)")&&src.includes("log('Printed report: '"));
must('exports are recorded',src.includes("log('Exported report '")&&src.includes("log('Downloaded file: '+name)"));
must('safety net on refresh and saved',src.includes('function refresh(){try{ulSafety()}catch(e){}saveDB();render()}')&&src.includes('function saved(msg){try{ulSafety(msg)}catch(e){}'));
// not in the synced hotel file: screens and refused attempts go to ULOG only
must('screens do not go to the synced log list',/function ulScreen[\s\S]{0,700}ULOG\.add\('Opened screen '/.test(src)&&!/function ulScreen[\s\S]{0,700}[^.]log\('Opened screen/.test(src));
// Close Day saves the day as a file
must('Close Day saves the file',src.includes('const nUl=await ulExportDay(bd)'));
// read only for everybody: no edit or delete anywhere in the code path
must('no delete or edit code for the records in the page',!/ulDelete|ulEdit|maha_user_logs_(update|delete)/.test(src));
// the SQL
const sql=fs.readFileSync(__dirname+'/../../supabase/migrations/20261028120000_user_logs.sql','utf8');
must('table has RLS on',sql.includes('alter table public.maha_user_logs enable row level security;'));
must('no direct table access for anyone',sql.includes('revoke all on public.maha_user_logs from public, anon, authenticated;')&&!/grant\s+(select|insert|update|delete)[^;]*on\s+public\.maha_user_logs/i.test(sql));
must('push checks sign-in and write access',sql.includes("raise exception 'not-signed-in'")&&sql.includes('public.maha_can_write_property(target_property)'));
must('pull checks access',sql.includes('public.maha_can_access_property(target_property) or public.maha_is_platform_admin()'));
must('functions pin the search path',(sql.match(/set search_path = ''/g)||[]).length>=2);
must('batch size is limited',sql.includes('jsonb_array_length(lines) > 300'));
must('lines are stamped with the real account',sql.includes('uid,')&&sql.includes('uid uuid := (select auth.uid())'));
must('sending twice stores once',sql.includes('on conflict (property_id, id) do nothing'));
console.log('userlogs ok');
// retention: screens and prints/exports are removed after 90 days, everything else is kept
{const sql2=fs.readFileSync(__dirname+'/../../supabase/migrations/20261028120000_user_logs.sql','utf8');
 if(!sql2.includes("g.title in ('Screen', 'Print & export')")||!sql2.includes('g.bd < current_date - 90'))fail('90-day cleanup missing');
 if(/delete\s+from\s+public\.maha_user_logs[^;]*title\s*(<>|!=|not in)/i.test(sql2))fail('the cleanup must only name the two unimportant titles');
 if(!sql2.includes('revoke all on public.maha_user_logs_state from public, anon, authenticated;'))fail('state table must be closed');
 console.log('retention ok');}
// the Close Day file is a switch in Hotel Settings, off by default
{if(!src.includes("if(H&&H.set&&H.set.ulogFile){try{const nUl=await ulExportDay(bd)"))fail('Close Day file must only run when the hotel switched it on');
 if(!src.includes("id=\"sUlf\" ${s.ulogFile?'checked':''}"))fail('the switch must default to off');
 if(!src.includes("s.ulogFile=!!($('#sUlf',el)&&$('#sUlf',el).checked);"))fail('the switch must be saved');
 // an open tab is told when the site was updated
 if(!src.includes('function watchNewVersion(')||!src.includes("try{watchNewVersion()}catch(e){}ensureMasterProvider();"))fail('new version prompt missing');
 if(!src.includes('A new version of Maha PMS is ready.'))fail('new version text');
 console.log('switch and new-version prompt ok');}
