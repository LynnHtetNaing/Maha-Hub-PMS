const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
let fails=0;const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
const a=src.indexOf('const _tzFmt={};'),b=src.indexOf('\n}\n',src.indexOf('function tzp(t,zone){'))+3;
const c=src.indexOf('function ulWhenIn(t,zone)'),d=src.indexOf('\n',c);
const api=new Function("const pad=n=>String(n).padStart(2,'0');"+src.slice(a,b)+src.slice(c,d)+";return {ulWhenIn}")();
const at=Date.UTC(2026,9,29,18,30,0);   // one moment: 29 Oct 2026 18:30 universal time
const want={'Asia/Bangkok':'30/10/2026 01:30:00','Europe/London':'29/10/2026 18:30:00','America/New_York':'29/10/2026 14:30:00','Asia/Yangon':'30/10/2026 01:00:00','Asia/Kolkata':'30/10/2026 00:00:00','Australia/Sydney':'30/10/2026 05:30:00'};
for(const z of Object.keys(want))T('the same moment in '+z,api.ulWhenIn(at,z)===want[z],api.ulWhenIn(at,z));
/* the changing of the clocks in the UK: 25 Oct 2026, 01:00 universal time */
T('UK, last second of summer time',api.ulWhenIn(Date.UTC(2026,9,25,0,59,59),'Europe/London')==='25/10/2026 01:59:59',api.ulWhenIn(Date.UTC(2026,9,25,0,59,59),'Europe/London'));
T('UK, first second of winter time',api.ulWhenIn(Date.UTC(2026,9,25,1,0,0),'Europe/London')==='25/10/2026 01:00:00',api.ulWhenIn(Date.UTC(2026,9,25,1,0,0),'Europe/London'));
/* a moment that is one calendar day later in the hotel than in the viewer's place keeps both dates exact */
T('date changes with the zone',api.ulWhenIn(Date.UTC(2026,10,1,20,0,0),'Asia/Bangkok')==='02/11/2026 03:00:00'&&api.ulWhenIn(Date.UTC(2026,10,1,20,0,0),'America/Los_Angeles')==='01/11/2026 12:00:00');
/* the screen */
T('titles Hotel User Time and Your Time, each with its zone',src.includes('<th>Hotel User Time<span class="ulz">')&&src.includes('<th>Your Time<span class="ulz">')&&!/<th>When<\/th><th>User<\/th><th>Shift<\/th><th>Field \/ Title/.test(src));
T('the hotel column uses the hotel zone, the other the viewer\'s computer zone',src.includes('ulTwoLine(x.at,hz)')&&src.includes('ulTwoLine(x.at,mz)')&&src.includes("function ulHotelZone(){return (H&&H.set&&H.set.tz)||'Asia/Bangkok'}")&&src.includes('Intl.DateTimeFormat().resolvedOptions().timeZone'));
T('the Excel file has both times',src.includes("<th>Hotel User Time ('+esc(ulZoneLabel(ulHotelZone()))")&&src.includes("<th>Your Time ('+esc(ulZoneLabel(ulMyZone()))"));
process.exit(fails?1:0);
