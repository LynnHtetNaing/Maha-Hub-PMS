/* City Ledger: the Receive window, the receipts in the reports, the table.
     node tests/sync/cityledger-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf('function settleCity('), b = src.indexOf("\nVIEWS['bill.city']=el=>{", a), sc = src.slice(a, src.indexOf('function clTxModal(', a));
T('Receive window has User name and Date & time blocks that cannot be edited', sc.includes("blk('User name'") && sc.includes("blk('Date &amp; time'") && /class="clblk"><small>\$\{l\}<\/small><b>/.test(sc));
T('Payment method block shows the type chosen in the payment window', sc.includes("blk('Payment method',cur?esc(cur.desc)"));
T('the folio payment window (types, tran code, reference, amount, remark, Post) is inside the same window, no second pop-up', sc.includes('class="nitabs"') && sc.includes('data-pc="${c.code}"') && sc.includes("fld('Tran code'") && sc.includes('id="clS">Post payment') && (sc.match(/modal\(/g) || []).length === 1);
T('City Ledger itself is not offered as the payment type', sc.includes("c.ptab!=='CITY LEDGER'"));
T('full width window, one payment box, only the payment type list scrolls, the form stays still', sc.includes("{w:1240,cls:'nimodal paym clrecv'}") && sc.includes('class="clpay"') && src.includes('.clrecv .nitiles{position:absolute;inset:0;max-height:none;overflow-y:auto') && src.includes('.clrecv .niform{overflow:visible}') && src.includes('.clrecv #clB{padding:16px'));
T('the payment is a line in no guest folio, counted in the shift and in the reports', sc.includes('clItem:items[0].id') && sc.includes("kind:'pay'") && !sc.includes('B.lines.push') && src.includes("(it.pays||[]).forEach(p=>{if(p.line)o.push(p.line);if(p.corr)o.push(p.corr)})"));
T('a payment needs a cashier shift (no-shift people choose an open one)', sc.includes("noShiftGate('payment'"));
const t = src.slice(b, src.indexOf("\nVIEWS['cd.petty']", b));
T('table: Outstanding, Received and Payment method columns', t.includes('<th>Outstanding</th><th>Received</th><th>Payment method</th><th>Days open</th>') && !t.includes('<th>Amount</th>') && t.includes('table-layout:fixed') === false && src.includes('.clpanel table.grid{width:100%;table-layout:fixed}'));
T('clicking a paid line opens the Transaction window', t.includes('data-clt=') && t.includes('clTxModal(it,it.pays[+i])') && src.includes("modal('Transaction'") && src.includes('function clTxModal('));
T('Receive button does not trigger the row click', t.includes('e.stopPropagation();settleCity([b.dataset.cls])'));
T('currency button: main currency is the default, a rate is typed for another currency, the main-currency value reduces the invoice', sc.includes("cs=B0&&curUserOn()?{cur:main,rp:''}:null") && sc.includes('id="clCb"') && sc.includes('amt:-eq,kind') && sc.includes('line.fc=cs.cur;line.fa=-a;line.fr=rate;line.eq=-eq'));
T('Correct payment: only a payment of today, with permission or as a request, and a reason; it opens the invoice again and counts in the reports', src.includes('p.bd===H.set.bd&&(direct||viaReq)&&!pend') && src.includes("kind:'corrpay',desc:'Correct - '+p.line.desc") && src.includes('item.pays.filter(p=>!p.corrected)') && src.includes('if(p.corr)o.push(p.corr)'));
T('Correct payment approval route: no permission and the request switch on sends a request; an approver applies it as the person who asked', src.includes("queueApproval({action:'clcorr',kind:'corrpay'") && src.includes("if(ap.action==='clcorr'){") && src.includes("clCorrect(ap.lineId,(ap.reason||'')+' (asked by '+asU+', approved by '+user().name+')',asU,sh||null)") && src.includes("a.action==='clcorr'&&a.lineId===rid"));
T('currency reports: city ledger receipts follow the same split as folio payments (ALL in the main currency, a currency report only its own currency, no folio report)', src.includes('(c.cityLedger||[]).forEach(it=>(it.pays||[]).forEach(p=>{[p.line,p.corr].forEach(l=>{if(l)strip(l)})}))') && src.includes("if(kind!=='cash'||(l.fc||main)!==mode){p[k]=null;return}"));
/* tick boxes, one payment for many invoices, the tax invoice, the Provider switch */
T('tick column, company filter that ticks all lines of the company, one company at a time', t.includes('id="clAll"') && t.includes('data-clk=') && t.includes('id="clCo"') && t.includes("CLSEL[x.id]=true") && src.includes('One payment is for one company'));
T('bar with the ticked total, Invoice and Pay', t.includes('class="clbar"') && t.includes('id="clInv"') && t.includes('id="clPay"') && t.includes('settleCity(ticked.map(x=>x.id))'));
T('one payment over many invoices: oldest first, one line in the reports, overpayment blocked', sc.includes('const split=eq=>') && sc.includes('Oldest first') && sc.includes('lineId:line.id') && sc.includes('if(i===0)p.line=line') && sc.includes('That is more than the outstanding balance.'));
T('correct payment takes back the whole payment (all invoices it paid)', src.includes('batch.forEach(b=>{b.p.corrected={at:t') && src.includes('function clBatch(rid)'));
T('tax invoice: logo, terms, acknowledgement of payer, signatures, our numbering and register', src.includes('function clInvoiceHtml(') && src.includes('${hotelHead()}') && src.includes('class="clterms"') && src.includes('Acknowledgement of payer') && src.includes("Payer's signature") && src.includes('taxInvoiceFor(V,key,amount,bt,1)') && src.includes('reserveInvoice(V,key,amount,bt,1)') && src.includes("i.cl?'cl'"));
T('a line goes on one invoice only; the same set can be printed again', src.includes('is already on tax invoice') && src.includes('x.invKey=key'));
T('the page is open to everyone; ticks, Invoice, Pay and Correct payment follow the City ledger switch of the Provider console', src.includes('function clOpenFor(u)') && src.includes('function clAllowed()') && src.includes('data-cl=') && src.includes('u.clLedger=!!c.checked') && !t.includes('City Ledger needs the payment or reports permission'));
process.exit(fails ? 1 : 0);
