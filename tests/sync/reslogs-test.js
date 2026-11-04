/* Reservation detail: User logs, from the day it was created, only what concerns the reservation.
     node tests/sync/reslogs-test.js ecosystem/index.html */
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok)=>{console.log((ok?'PASS ':'FAIL ')+n);if(!ok)fails++};
T('the reservation page has a User logs button (in More)',src.includes("tbR('aLog','log'")&&src.includes("more=['aNotif','aLog',"));
T('the button opens the reservation logs',src.includes("lg.onclick=()=>resLogs(B)"));
T('oldest first, so "Reservation created" by the person is the first line',src.includes("filter(h=>!money.test(String(h.what||h.a||''))).slice().sort((a,b)=>a.at-b.at)"));
T('money lines (refund, rebate, adjust, deposit, upgrade charge) stay in the folio logs',src.includes('/^(Refund|Rebate|Adjust|Reservation deposit|Room Upgrade Charge)/i'));
T('an older reservation without a created line gets one at its RSVN date',src.includes('Reservation created (made before user logs were kept)'));
T('the log shows When, User, Shift and what happened',src.includes('<th>When</th><th>User</th><th>Shift</th><th>What happened</th>'));
process.exit(fails?1:0);
