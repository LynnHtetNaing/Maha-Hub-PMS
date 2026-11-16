/* The "Mail" button of the generic print preview (printPages): it now sends the document at once, with a "View document" link the guest
   can open, print or save. One shared function covers Tax Invoice, Credit Note, Deposit and Reservation confirmation; Registration Card
   and the internal reports (Hotel Status, Shift report, Forecast, Terms preview) are left on the old "open my mail program" behaviour.
     node tests/sync/pmsdocmail-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const pms = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const fn = rd('supabase/functions/pms-send-mail/index.ts');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('the function still checks sign-in and write access before either kind of mail', fn.includes('auth.getUser(') && fn.includes('maha_can_write_property') && fn.includes('const since = ') && fn.includes('HOURLY_LIMIT'));
T('a document mail makes a long random token, stores the document under it (the trusted server, not the browser), and never trusts a huge or empty document',
  fn.includes('crypto.randomUUID().replace(/-/g, "")') && fn.includes('from("maha_shared_docs").insert') && fn.includes('DOC_HTML_MAX') && fn.includes('!docHtml.trim()') && fn.includes('docHtml.length > DOC_HTML_MAX'));
T('an empty document and an oversized one are told apart: empty is bad_request (a real client bug), oversized is its own doc_too_large error, never both mapped to "check the guest email"',
  fn.includes('if (!docHtml.trim()) return json(req, { error: "bad_request" }, 400);') && fn.includes('if (docHtml.length > DOC_HTML_MAX) return json(req, { error: "doc_too_large" }, 413);') && pms.includes("doc_too_large:'This document is too large to email"));
T('the document size limit has real headroom for a multi-page, ORIGINAL+COPY invoice that repeats the hotel logo on every page', /const DOC_HTML_MAX = 3_000_000;/.test(fn));
T('the link reuses the CRM\'s own document page (crm.maha-hub.com/d/<token>), not a new page of our own', fn.includes('"https://crm.maha-hub.com/d/"') && fn.includes('PMS_DOC_BASE'));
T('the mail has a View button naming the document and the hotel, and is still the Maha Hub no-reply brand', fn.includes('function docMailHtml') && fn.includes('View ${esc(docTitle)}') && fn.includes('Please do not reply'));
T('each send (confirmation or a document) is logged the same way, with the document title as the record', fn.includes("doc: docName") && fn.includes("status: res.ok ? \"sent\" : \"failed\""));

T('printPages decides for itself: a usable guest email with auto not switched off means a real send; otherwise it still just opens the mail program',
  pms.includes("const auto=!!(mail&&mail.to&&mail.auto!==false&&") && pms.includes("if(!auto){") && pms.includes('prepareMail(Object.assign('));
T('the real send shows a loading spinner, then a success note; a failure is shown in words, the button stays usable',
  pms.includes("btn.innerHTML='<span class=\"spin\"></span> Sending...'") && pms.includes("centerNote(title+' sent successfully to '+mail.to+'.','saved')") && pms.includes("if(!res.ok){toast(res.msg);return}"));
T('the document sent is the exact page already shown in the preview, wrapped once with the CSS it needs and a Save as PDF / Print button, no separate design to keep in step',
  pms.includes('function docViewHtml(title,bodyHtml)') && pms.includes('DOC_VIEW_CSS') && pms.includes('Save as PDF / Print') && pms.includes('pmsSendDoc(mail.to,mail.subject||(title'));
T('Registration Card keeps opening the staff mail program (a signature page, not sent this way)', pms.includes("subject:'Registration card '+r.no+' · '+H.set.name,auto:false"));
T('Credit note, the folio invoice/receipt, and the reservation deposit are not changed at their own call sites: printPages now auto-sends them because they already pass the guest email',
  /printPages\(built\.html,'Credit note '\+cn\.no,\{to:r\.email\|\|g\.email\|\|''/.test(pms) && /printPages\(built\.html,title,\{to:r\.email\|\|g\.email\|\|''/.test(pms));
T('the booking confirmation preview opened from the panel also sends for real now, to the guest on the booking', pms.includes("printPages(p.html,'Reservation confirmation '+p.r.no,{to:p.email"));
T('internal reports keep the old Mail (no guest to send to): Hotel Status, Shift report, Forecast, Terms preview are untouched',
  ["printPages(hxPrintHtml(S,", "printPages(res.html,'Shift report", "printPages(fcPrint(tbl,to,days),'Forecast')"].every(s => pms.includes(s)));
T('the City Ledger consolidated tax invoice sends the same way, to the company\'s own email (set on Company / Agency)',
  pms.includes("printPages(clInvoiceHtml(items,inv,bt),title,{to:(co&&co.email)||''") && pms.includes("const title='Tax invoice '+invRef(inv);"));
T('Company / Agency has its own Email field (for City Ledger invoices), editable by setup, saved with validation',
  pms.includes('<th>Email</th>') && pms.includes('data-coe="${c.id}"') && pms.includes("$$('[data-coe]',el).forEach(inp=>inp.onchange=") && pms.includes("fld('Email (for City Ledger invoices)',`<input id=\"ceml\">`") && pms.includes('email,comm:pct,'));
T('the Guest Profile no longer has its own Email guest button (nothing to send from there by design)', !pms.includes("tb('gpM','mail','Email guest')") && !pms.includes("$('#gpM',m).onclick"));
T('printPages can send a different, mail-only html than what Print shows (so a mailed invoice/credit note/deposit is not the full printed paper set)',
  pms.includes("pmsSendDoc(mail.to,mail.subject||(title+' · '+H.set.name),title,mail.html||html,mail.rsvn||'')"));
T('a Tax Invoice / Guest Folio / Reservation Deposit (openMoneyDoc) prints Original + Copy as chosen, but always mails just the one Copy',
  /const mailHtml=spec\.copies==='copy'\?built\.html:moneyDocHtml\(B,Object\.assign\(\{\},spec,\{copies:'copy'\}\)\)\.html;\s*\n\s*printPages\(built\.html,title,\{to:r\.email\|\|g\.email\|\|'',rsvn:r\.no,subject:title\+' · '\+H\.set\.name,html:mailHtml\}\)/.test(pms));
T('a Credit Note prints Original + Copy, but always mails just the one Copy', /const mailHtml=spec\.copies==='copy'\?built\.html:moneyDocHtml\(B,Object\.assign\(\{\},spec,\{copies:'copy'\}\)\)\.html;\s*\n\s*printPages\(built\.html,'Credit note '\+cn\.no,\{to:r\.email\|\|g\.email\|\|'',rsvn:r\.no,subject:'Credit note '\+cn\.no\+' · '\+H\.set\.name,html:mailHtml\}\)/.test(pms));
T('the City Ledger tax invoice prints Original + Copy, but always mails just the one Copy', pms.includes("html:clInvoiceHtml(items,inv,bt,['COPY'])") && pms.includes('function clInvoiceHtml(items,inv,bt,labels){') && pms.includes("(labels||['ORIGINAL','COPY']).map(lb=>pages.map((c,i)=>page(c.slice(),i,lb)).join('')).join('')"));
T('the Reservation Deposit print keeps whichever Original/Copy choice was picked on screen, but its mail always sends just the one Copy, and tax-invoice numbers are reserved only once (not doubled by building the mail-only html)',
  /const mailHtml=o\.copies==='copy'\?html:specs\.map\(spec=>moneyDocHtml\(B,Object\.assign\(\{\},spec,\{copies:'copy'\}\)\)\.html\)\.join\(''\);/.test(pms) && (pms.match(/taxInvoiceFor\(B,spec\.key,spec\.base,o\.bill,4\)/g) || []).length === 1);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
