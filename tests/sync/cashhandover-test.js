/* Closing float, cash to drop, float shortage, and the Cash Handover record.
     node tests/sync/cashhandover-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const a = src.indexOf("VIEWS['cd.shift']=el=>{"), b = src.indexOf('/* ---------- Close Day', a), sh = src.slice(a, b);
T('close shift: the closing float left in the drawer must be typed (0 if none) and cannot be more than the cash counted', sh.includes("id=\"csF\"") && sh.includes('Type the closing float left in the drawer (type 0 if none).') && sh.includes('The closing float cannot be more than the cash counted.'));
T('close shift: cash to drop = counted - closing float; float shortage = opening float - closing float (strict only), shown live', sh.includes('(counted − closing float)') && sh.includes('Float shortage (opening float − closing float)') && sh.includes('m2(cn-cf)') && sh.includes('m2(gO-cf)'));
T('the shift keeps closeFloat, cashDrop and floatShort; the shift float record keeps the closing float', sh.includes('closeFloat:cf,cashDrop:r2(cnt-cf)') && sh.includes('floatShort:r2(gO-cf)') && sh.includes('fr.close=flexNow?r2((fr.close||0)+cf):cf'));
T('expected cash is unchanged: opening float + cash received (the float is never income)', src.includes('expected:r2(floatIn+drop)') && src.includes('open=r2((s.openCash||0)+sfOpenOf(H,s))'));
T('the next shift opening float is compared with the last closing float (shown on My Shift; the count at sign-in stays blind)', src.includes('function sfPrevClose(h)') && src.includes('const pc=sfPrevClose(h);if(pc!=null)fl.prev=pc;') && sh.includes('Closing float of the last shift') && !/does not match the opening float[^']*\$\{?pc/.test(src));
/* Cash Handover: a record only */
const c = src.indexOf("VIEWS['cd.handover']=el=>{"), d = src.indexOf("VIEWS['cd.petty']=el=>{", c), ho = src.slice(c, d);
T('Cash Handover is a page in the Close Day menu, open to everyone (no permission), switchable under Functions', src.includes("['Cash Handover','cd.handover','','fn.cd.handover']"));
T('Cash Handover is a record only: it never touches shift totals, the folio or revenue', !/addLine|postPayment|allLinesH|shiftTotals|openCash|sfRec\(/.test(ho) && ho.includes("status:'pending'"));
T('a record: amount typed by hand, goes to the next shift automatically, posted later by the next shift (Mark posted) or cancelled', ho.includes('hoNext(s.name,s.bd)') && ho.includes("status:'posted'") && ho.includes("x.status='cancelled'") && ho.includes('data-hp=') && ho.includes('data-hc='));
T('Close Day warns (does not block) about hand overs not posted', src.includes("k:'handover',t:'Cash handover not posted'") && /block:false,k:'handover'/.test(src));
T('hand overs are hotel data that syncs', src.includes("MS_KEYS={shiftFloats:'k',handovers:'id',") && src.includes('h.handovers=Array.isArray(h.handovers)?h.handovers:[]'));
{ const i = src.indexOf('function hoNext('), j = src.indexOf('\n', i), fn = new Function("const addD=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};const HO_ORDER=['Morning','Afternoon','Night'];" + src.slice(i, j) + ';return hoNext;')(), x = fn;
  T('next shift: Morning > Afternoon > Night > next day Morning', x('Morning', '2026-10-31').name === 'Afternoon' && x('Afternoon', '2026-10-31').name === 'Night' && x('Night', '2026-10-31').name === 'Morning' && x('Night', '2026-10-31').bd === '2026-11-01' && x('Morning', '2026-10-31').bd === '2026-10-31'); }
process.exit(fails ? 1 : 0);
