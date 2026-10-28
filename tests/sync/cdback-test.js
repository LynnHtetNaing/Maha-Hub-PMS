const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const must=(m,c)=>{if(!c)fail(m)};
// Close Day: Folio / check out opens the Folio page, Extend opens the Departure page, both remember where they came from
must('Folio / check out opens the folio with the pull-back flag',src.includes("CDBACK={id:b.dataset.cdfo};go('bill.open',b.dataset.cdfo)"));
must('Extend opens the Departure page with the pull-back flag',src.includes("CDBACK={id:b.dataset.cdext};go('fo.departures2',b.dataset.cdext)"));
must('the Extend button has its own hook',src.includes('data-cdext="${i.id}">Extend</button>'));
// the Back button and bar exist on both pages
must('Back to Close Day bar',src.includes('Back to Close Day</button>')&&src.includes("go('cd.close')"));
must('Folio page shows the bar',src.includes("el.innerHTML=cdBackBar()+pageHead('Billing / Folio'"));
must('Departure page shows the bar',src.includes("el.innerHTML=cdBackBar()+pageHead('Departures'"));
// the long list on the left of the Departure detail is gone
const dep=src.slice(src.indexOf("VIEWS['fo.departures2']"),src.indexOf('/* ---------- in house ---------- */'));
must('no left list on the Departure detail',!dep.includes('sideSearch(')&&!dep.includes('id="sideL"'));
// the pull-back is forgotten when the person goes elsewhere, and a check-out from Close Day returns there
must('go() clears the flag for other pages',src.includes("if(!['bill.open','fo.departures2','cd.close'].includes(v))CDBACK=null"));
must('check-out from Close Day returns to Close Day',src.includes("if(await checkOut(B)){if(CDBACK){CDBACK=null;go('cd.close')}else re()}"));
console.log('cdback ok');
