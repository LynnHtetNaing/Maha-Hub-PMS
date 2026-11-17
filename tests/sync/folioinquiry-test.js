/* Folio Inquiry: a line opens the real Billing / Folio view directly (no separate read-only page, no extra step, no Back-button loop
   between two pages), and that view shows only the buttons that still work on a checked-out folio.
     node tests/sync/folioinquiry-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('a Folio Inquiry line opens the real Billing / Folio view straight away', src.includes("$$('[data-fol]',el).forEach(r=>r.onclick=e=>{if(e.target.closest('[data-back]'))return;go('bill.open',r.dataset.fol)});"));
T('the old read-only Folio Inquiry page (and its own Back button, the source of the Back-button loop) is gone', !src.includes("VIEWS['bill.inqfolio']") && !src.includes('function inquiryFolios(') && !src.includes('id="fiBack"') && !src.includes('id="biOpen"'));
T('Check in back (same day, before Close Day) and the dummy-account history list are unchanged on the Folio Inquiry list', src.includes("canCheckBack(b)?`<button class=\"btn sm gold\" data-back=\"${b.id}\"") && src.includes('Dummy account history'));
T('a checked-out folio (status "out") shows only Print, Detail, Notices and User logs as buttons, all on the outside - nothing it cannot do (Post, Payment, Advance, Transfer, Rate setup, Split, Offset, Lock, Registration card, Cancel check-in, Check out), and no "More" menu to dig through',
  src.includes("const simple=B.status==='out';") && src.includes("const mainKeys=simple?['fInv','fDet','fNot','fLog']:['fPost','fPay','fAdv','fMove','fInv','fDet'];") && src.includes("const rows=simple?'':['fView','fRate','fSplit','fOff','fLock','fReg','fNot','fLog','fCCI'].map(k=>FB[k]||'').join('');") && src.includes("const more=rows?"));
T('Check in back still shows on a checked-out folio when it applies, and Check out never does (the booking is no longer in house)',
  src.includes('${FB.fBack||\'\'}${simple?\'\':FB.fOut||\'\'}'));
T('Notices and User logs sit on the outside as plain horizontal buttons on a checked-out folio, not the vertical full-width "More" menu style',
  src.includes("const main=['fPost','fPay','fAdv','fMove','fInv','fDet','fOut','fBack'].includes(id)||(simple&&['fNot','fLog'].includes(id));"));
T('opening a checked-out booking\'s folio - from Folio Inquiry, Close Day, or anywhere else - titles the page "Folio Inquiry", not "Billing / Folio"',
  src.includes("const title=(extra&&extra.status==='out')?'Folio Inquiry':'Billing / Folio';") && src.includes("el.innerHTML=cdBackBar()+pageHead(title,'<div class=\"bsrch\" id=\"bfSearch\"></div>','act')"));
T('the plain "Folio" menu item drops a checked-out folio left on screen from Folio Inquiry/Close Day and starts fresh, instead of staying stuck on it under the "Folio Inquiry" title',
  src.includes("VIEWS['bill.folio']=(el,id)=>{if(!id){const cur=BF.sel&&bookingById(BF.sel);if(cur&&cur.status!=='inhouse')BF.sel=null}billingSplit(el,id)};") && src.includes("$$('[data-go]',nav).forEach(b=>b.onclick=()=>{closeMenus();const mi=$('#mitems');if(mi)mi.classList.remove('open');go(b.dataset.go)});"));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
