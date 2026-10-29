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
T('the hotel column uses the hotel zone, the other the viewer\'s computer zone',src.includes('esc(ulWhenIn(x.at,hz))')&&src.includes('esc(ulWhenIn(x.at,mz))')&&src.includes("function ulHotelZone(){return (H&&H.set&&H.set.tz)||'Asia/Bangkok'}")&&src.includes('Intl.DateTimeFormat().resolvedOptions().timeZone'));
T('the Excel file has both times',src.includes("<th>Hotel User Time ('+esc(ulZoneLabel(ulHotelZone()))")&&src.includes("<th>Your Time ('+esc(ulZoneLabel(ulMyZone()))"));
process.exit(fails?1:0);
{const s2=fs.readFileSync(process.argv[2],'utf8');
 const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)process.exitCode=1};
 ok('no Reference column; an open link to the reservation instead',!s2.includes('<th>What they did</th><th>Reference</th></tr></thead>')&&s2.includes('data-ulopen=')&&s2.includes("go('res.open',a.dataset.ulopen)"));
 ok('each new line about a booking names its RSVN and room in the words',s2.includes('a:ulPlace(String(a),ref).slice(0,800)')&&s2.includes("add+=' · RSVN '+r.no")&&s2.includes("add+=' · Room '+B.room"));
 ok('older lines get the RSVN when shown; the Excel file has a Reservation column',s2.includes('function ulWhat(x)')&&s2.includes('<th>What they did</th><th>Reservation</th></tr>')&&s2.includes('function ulRsvnOf(ref)'));
 ok('the time is one line, date and time, in both columns',s2.includes("esc(ulWhenIn(x.at,hz))+'</td><td data-l=\"Your Time\"")&&!s2.includes('function ulTwoLine'));
}
