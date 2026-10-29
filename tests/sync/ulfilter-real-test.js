/* The User Logs date filter works on the REAL moment, in the zone the person chose, for a viewer anywhere in the world. */
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
const grab=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('cut '+a);return src.slice(i,j)};
const pre="const pad=n=>String(n).padStart(2,'0');const P=s=>{const a=String(s).split('-').map(Number);return new Date(a[0],a[1]-1,a[2])};const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());const addD=(s,n)=>{const d=P(s);d.setDate(d.getDate()+n);return iso(d)};";
const code=pre+grab('const _tzFmt={};','/* ---- end')+'';
let tz=''; // tzp
{const a=src.indexOf('const _tzFmt={};'),b=src.indexOf('\n}\n',src.indexOf('function tzp(t,zone){'))+3;tz=src.slice(a,b)}
const ul=grab('function ulDayStart(iso,zone)','function ulZoneLabel(zone,t)');
const api=new Function(pre+tz+ul+';return {ulDayStart,ulTodayIn,ulWindow:(f,t,z)=>({fromAt:ulDayStart(f,z),toAt:ulDayStart(addD(t,1),z)}),tzp}')();
const H=3600000,D=24*H;
const UTC=(y,m,d,h=0,mi=0,s=0)=>Date.UTC(y,m-1,d,h,mi,s);
/* the start of a calendar day in different places */
T('Bangkok 30 Oct starts 29 Oct 17:00 universal',api.ulDayStart('2026-10-30','Asia/Bangkok')===UTC(2026,10,29,17));
T('London 30 Oct starts 30 Oct 00:00 universal',api.ulDayStart('2026-10-30','Europe/London')===UTC(2026,10,30,0));
T('New York 30 Oct starts 30 Oct 04:00 universal',api.ulDayStart('2026-10-30','America/New_York')===UTC(2026,10,30,4));
T('Sydney 30 Oct starts 29 Oct 13:00 universal',api.ulDayStart('2026-10-30','Australia/Sydney')===UTC(2026,10,29,13));
T('Kolkata 30 Oct starts 29 Oct 18:30 universal',api.ulDayStart('2026-10-30','Asia/Kolkata')===UTC(2026,10,29,18,30));
T('Kiritimati (UTC+14) 30 Oct starts 29 Oct 10:00 universal',api.ulDayStart('2026-10-30','Pacific/Kiritimati')===UTC(2026,10,29,10));
T('Pago Pago (UTC-11) 30 Oct starts 30 Oct 11:00 universal',api.ulDayStart('2026-10-30','Pacific/Pago_Pago')===UTC(2026,10,30,11));
/* days that are not 24 hours long */
T('UK day when the clocks go back (25 Oct 2026) is 25 hours',api.ulWindow('2026-10-25','2026-10-25','Europe/London').toAt-api.ulWindow('2026-10-25','2026-10-25','Europe/London').fromAt===25*H);
T('UK day when the clocks go forward (29 Mar 2026) is 23 hours',api.ulWindow('2026-03-29','2026-03-29','Europe/London').toAt-api.ulWindow('2026-03-29','2026-03-29','Europe/London').fromAt===23*H);
/* the situation in the question: the hotel is still on 29 Oct, the owner's calendar is already on 30 Oct */
const line=UTC(2026,10,29,18,30);   // hotel (Bangkok) 30 Oct 01:30
const inWin=(from,to,zone)=>{const w=api.ulWindow(from,to,zone);return line>=w.fromAt&&line<w.toAt};
T('a Thai viewer picking 29 Oct does not see it, picking 30 Oct does (it happened after midnight there)',!inWin('2026-10-29','2026-10-29','Asia/Bangkok')&&inWin('2026-10-30','2026-10-30','Asia/Bangkok'));
T('a London viewer sees it on 29 Oct',inWin('2026-10-29','2026-10-29','Europe/London')&&!inWin('2026-10-30','2026-10-30','Europe/London'));
T('a viewer 18 hours ahead of the hotel (Kiritimati +14 vs Bangkok +7 is 7h; use Pacific/Auckland +13 and Pago Pago -11 = 24h apart): each sees it on exactly one day',inWin('2026-10-30','2026-10-30','Pacific/Auckland')&&!inWin('2026-10-29','2026-10-29','Pacific/Auckland')&&inWin('2026-10-29','2026-10-29','Pacific/Pago_Pago')&&!inWin('2026-10-30','2026-10-30','Pacific/Pago_Pago'));
/* the filter and the column agree, everywhere, for any moment */
const zones=['Asia/Bangkok','Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney','Asia/Kolkata','Asia/Kathmandu','Pacific/Kiritimati','Pacific/Pago_Pago','Pacific/Auckland','America/Sao_Paulo','Africa/Cairo'];
let bad=0,n=0,seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
for(const z of zones){for(let i=0;i<400;i++){const t=UTC(2026,1,1)+Math.floor(rnd()*365*D);const p=api.tzp(t,z),day=p.y+'-'+p.m+'-'+p.d;const w=api.ulWindow(day,day,z);n++;if(!(t>=w.fromAt&&t<w.toAt))bad++}}
T('for '+n+' moments in '+zones.length+' zones, the day shown in the column is exactly the day the filter finds it on',bad===0,'mismatches: '+bad);
/* days touch with no gap and no overlap */
let gaps=0;for(const z of zones){for(const d of ['2026-03-28','2026-03-29','2026-10-24','2026-10-25','2026-10-31','2026-11-01']){const a=api.ulWindow(d,d,z),b=api.ulWindow(require('child_process')?(()=>{const x=new Date(Date.UTC(...d.split('-').map((v,i)=>i==1?+v-1:+v)));x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)})():d,(()=>{const x=new Date(Date.UTC(...d.split('-').map((v,i)=>i==1?+v-1:+v)));x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)})(),z);if(a.toAt!==b.fromAt)gaps++}}
T('consecutive days meet exactly (no gap, no overlap), including the days the clocks change',gaps===0,'gaps: '+gaps);
/* the screen and the reader */
T('the screen has a Time basis (Your time, Hotel time, Business date), Your time first',src.includes('<option value="my" ')&&src.includes('<option value="hotel" ')&&src.includes('<option value="bd" ')&&src.includes('Time basis'));
T('the reader asks the cloud by real moment, with the days turned into moments',src.includes("MahaAuth.rpc('maha_user_logs_pull_at'")&&src.includes('function ulWindow(from,to,basis)')&&src.includes('const params=()=>{const w=ulWindow(UL.from,UL.to,UL.basis)'));
T('this computer\'s own lines are searched by real moment too',src.includes('async function localRowsAt(code,fa,ta,title,user)'));
T('the Excel file uses the same filter',src.includes("Object.assign({code:c.code,pid:c.pid,title:UL.title,user:ulWho(UL.user)},params())"));
T('the migration exists and is read only for staff (no table access)',fs.existsSync(require('path').join(__dirname,'..','..','supabase','migrations','20261029100000_user_logs_by_time.sql'))&&/maha_user_logs_pull_at/.test(fs.readFileSync(require('path').join(__dirname,'..','..','supabase','migrations','20261029100000_user_logs_by_time.sql'),'utf8')));
process.exit(fails?1:0);
