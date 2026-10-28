const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('cut '+a);return src.slice(i,j)};
let H;const esc=x=>x;
eval(cut('function stayMark(B){','/* Status badge')+';globalThis.SM=stayMark');
H={set:{bd:'2026-10-27'}};
const L=b=>SM(b).label;
const eq=(m,a,b)=>{if(a!==b)fail(m+': got '+a+' want '+b)};
eq('confirmed arriving today is Due In',L({status:'confirmed',arr:'2026-10-27',dep:'2026-10-29'}),'Due In');
eq('confirmed waiting from an earlier day is Due In',L({status:'confirmed',arr:'2026-10-25',dep:'2026-10-29'}),'Due In');
eq('confirmed arriving later is Confirmed',L({status:'confirmed',arr:'2026-10-30',dep:'2026-11-01'}),'Confirmed');
eq('in house leaving today is Due Out',L({status:'inhouse',arr:'2026-10-25',dep:'2026-10-27',checkinDate:'2026-10-25'}),'Due Out');
eq('in house leaving later is In House',L({status:'inhouse',arr:'2026-10-25',dep:'2026-10-29',checkinDate:'2026-10-25'}),'In House');
eq('checked in today is Checked In',L({status:'inhouse',arr:'2026-10-27',dep:'2026-10-29',checkinDate:'2026-10-27'}),'Checked In');
eq('out is Checked Out',L({status:'out'}),'Checked Out');
eq('tentative',L({status:'tentative',arr:'2026-10-30'}),'Tentative');
eq('cancelled',L({status:'cancelled'}),'Cancelled');
eq('noshow',L({status:'noshow'}),'No Show');
// every page shows the status at the end of the line
for(const t of ['<th class="n">Balance</th><th>Status</th><th></th></tr>','<th>ETA / Flight</th><th>Status</th><th class="c">Check in</th></tr>','<th class="n">Balance</th><th>Access</th><th>Status</th>'.replace('<th class="n">Balance</th><th>Access</th>','<th>Access</th>')])
  if(!src.includes(t))fail('status column missing: '+t);
if(!src.includes("sp.from===H.set.bd&&sp.to===H.set.bd?'All of today\\'s arrivals are checked in."))fail('arrivals empty note');
if(!src.includes("All of today\\'s departures are checked out."))fail('departures empty note');
console.log('status ok');
