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
T('the payment is a line in no guest folio, counted in the shift and in the reports', sc.includes('clItem:item.id') && sc.includes("kind:'pay'") && !sc.includes('B.lines.push') && src.includes("(h.cityLedger||[]).forEach(it=>(it.pays||[]).forEach(p=>{if(p.line)o.push(p.line)}))"));
T('a payment needs a cashier shift (no-shift people choose an open one)', sc.includes("noShiftGate('payment'"));
const t = src.slice(b, src.indexOf("\nVIEWS['cd.petty']", b));
T('table: Outstanding, Received and Payment method columns', t.includes('<th class="n">Outstanding</th><th class="n">Received</th><th>Payment method</th>'));
T('clicking a paid line opens the Transaction window', t.includes('data-clt=') && t.includes('clTxModal(it,it.pays[+i])') && src.includes("modal('Transaction'") && src.includes('function clTxModal('));
T('Receive button does not trigger the row click', t.includes('e.stopPropagation();settleCity(b.dataset.cls)'));
process.exit(fails ? 1 : 0);
