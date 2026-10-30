/* City Ledger: the Receive window, the receipts in the reports, the table.
     node tests/sync/cityledger-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf('function settleCity(id){'), b = src.indexOf("\nVIEWS['bill.city']=el=>{", a), sc = src.slice(a, src.indexOf('function clTxModal(', a));
T('Receive window has User name and Date & time blocks that cannot be edited', sc.includes("blk('User name'") && sc.includes("blk('Date &amp; time'") && /class="clblk"><small>\$\{l\}<\/small><b>/.test(sc));
T('Payment method block shows the type chosen in the payment window', sc.includes("blk('Payment method',cur?esc(cur.desc)"));
T('the folio payment window (types, tran code, reference, amount, remark, Post) is inside the same window, no second pop-up', sc.includes('class="nitabs"') && sc.includes('data-pc="${c.code}"') && sc.includes("fld('Tran code'") && sc.includes('id="clS">Post payment') && (sc.match(/modal\(/g) || []).length === 1);
T('City Ledger itself is not offered as the payment type', sc.includes("c.ptab!=='CITY LEDGER'"));
T('full width window, one payment box, fits the screen without scrolling inside', sc.includes("{w:1240,cls:'nimodal paym clrecv'}") && sc.includes('class="clpay"') && sc.includes('b.style.zoom=Math.max(.5'));
T('the payment is a line in no guest folio, counted in the shift and in the reports', sc.includes('clItem:item.id') && sc.includes("kind:'pay'") && !sc.includes('B.lines.push') && src.includes("(it.pays||[]).forEach(p=>{if(p.line)o.push(p.line);if(p.corr)o.push(p.corr)})"));
T('a payment needs a cashier shift (no-shift people choose an open one)', sc.includes("noShiftGate('payment'"));
const t = src.slice(b, src.indexOf("\nVIEWS['cd.petty']", b));
T('table: Outstanding, Received and Payment method columns', t.includes('<th class="n">Outstanding</th><th class="n">Received</th><th>Payment method</th>'));
T('clicking a paid line opens the Transaction window', t.includes('data-clt=') && t.includes('clTxModal(it,it.pays[+i])') && src.includes("modal('Transaction'") && src.includes('function clTxModal('));
T('Receive button does not trigger the row click', t.includes('e.stopPropagation();settleCity(b.dataset.cls)'));
T('currency button: main currency is the default, a rate is typed for another currency, the main-currency value reduces the invoice', sc.includes("cs=B0&&curUserOn()?{cur:main,rp:''}:null") && sc.includes('id="clCb"') && sc.includes('amt:-eq,kind') && sc.includes('line.fc=cs.cur;line.fa=-a;line.fr=rate;line.eq=-eq'));
T('Correct payment: only a payment of today, with permission and a reason; it opens the invoice again and counts in the reports', src.includes("p.bd===H.set.bd&&(can('corrpay')") && src.includes("kind:'corrpay',desc:'Correct - '+p.line.desc") && src.includes('item.pays.filter(p=>!p.corrected)') && src.includes('if(p.corr)o.push(p.corr)'));
process.exit(fails ? 1 : 0);
