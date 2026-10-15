/* Tax Invoice Reference (provider hotel settings, section 14) and the Chains / Groups page. No network.
     node tests/sync/taxref-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const wait = () => new Promise(r => setTimeout(r, 5));

/* ---------------- 1. the invoice side ---------------- */
const a = src.indexOf('/* The number printed on a tax invoice'), b = src.indexOf('function companyLine');
if (a < 0 || b < a) throw new Error('invoice code not found');
const code = src.slice(a, b);
const mk = c => ({ code: c, set: { bd: '2026-10-09', nextInv: 1, gaplessInvoices: true }, invoices: [] });
let H = mk('H1'), online = true;
const calls = []; let reply = () => { throw new Error('no server') };
const env = {
  get H() { return H },
  MahaAuth: { on: () => online },
  MahaSync: { code: 'H1', pid: 'P1', rpc: async (name, body) => { calls.push({ name, body }); return reply(name, body) } },
  ProvSync: { items: new Map() }, user: () => ({ name: 'Ann' }), curShift: () => null, saveDB() { },
};
const api = new Function('env', 'with(env){' + code + ';return {reserveInvoice,invRef,invRefFor,invYM,invManualRef,invFormatCheck,invManual,gaplessOn,gaplessMsg,taxInvoiceFor,nextManualSeq}}')(env);
const mkErr = (msg, status) => { const e = new Error(msg); e.status = status; return e };

/* the format helpers */
T('example INV-000123: prefix, number, zero padding to 6 digits', api.invManualRef('INV-', 123, 6) === 'INV-000123');
T('slashes and dots are fine in a prefix: TAX/2026/000001', api.invManualRef('TAX/2026/', 1, 6) === 'TAX/2026/000001');
T('Unlimited: the number just grows past the minimum digits', api.invManualRef('INV-', 1234567, 6) === 'INV-1234567');
T('a prefix may be empty', api.invManualRef('', 7, 4) === '0007');
const okF = { prefix: 'INV-', start: 1, minDigits: 6, issued: 0 };
T('a good format passes', api.invFormatCheck(okF) === '');
T('prefix of 20 characters is allowed, 21 is refused', api.invFormatCheck({ ...okF, prefix: 'A'.repeat(20) }) === '' && /at most 20/.test(api.invFormatCheck({ ...okF, prefix: 'A'.repeat(21) })));
T('letters, digits and - _ / . are allowed in the prefix', api.invFormatCheck({ ...okF, prefix: 'aZ09-_/.' }) === '');
T('a space or another sign in the prefix is refused', /no spaces/.test(api.invFormatCheck({ ...okF, prefix: 'INV 1' })) && /no spaces/.test(api.invFormatCheck({ ...okF, prefix: 'INV#' })));
T('minimum digits must be 1 to 12', api.invFormatCheck({ ...okF, minDigits: 1 }) === '' && api.invFormatCheck({ ...okF, minDigits: 12 }) === '' && /1 to 12/.test(api.invFormatCheck({ ...okF, minDigits: 0 })) && /1 to 12/.test(api.invFormatCheck({ ...okF, minDigits: 13 })) && /1 to 12/.test(api.invFormatCheck({ ...okF, minDigits: NaN })));
T('starting number must be 1 or more', /1 or more/.test(api.invFormatCheck({ ...okF, start: 0 })) && /1 or more/.test(api.invFormatCheck({ ...okF, start: NaN })));
T('starting number is never lower than the highest number already issued', /highest number already issued \(50\)/.test(api.invFormatCheck({ ...okF, start: 49, issued: 50 })) && api.invFormatCheck({ ...okF, start: 50, issued: 50 }) === '');

(async () => {
  /* Standard stays exactly as today (same server function, same stored fields, same printed number) */
  reply = (n, b) => ({ no: b.floor_no, seq: b.floor_seq, ym: b.p_ym });
  await api.reserveInvoice({ id: 'b1' }, 'k1', 100, 'guest', 1);
  T('Standard: the page still asks maha_issue_invoice_ref and prints TIV-H1-2026-10-0001', calls.length === 1 && calls[0].name === 'maha_issue_invoice_ref' && api.invRef(H.invoices[0]) === 'TIV-H1-2026-10-0001' && H.invoices[0].seq === 1 && H.invoices[0].no === 1 && !('mseq' in H.invoices[0]));

  /* Manual: the server's own number and ref, stored on the invoice */
  H.set.invMode = 'manual'; calls.length = 0;
  let nextM = 123;
  reply = (n, b) => ({ no: b.floor_no, mseq: nextM, ym: b.p_ym, ref: 'INV-' + String(nextM++).padStart(6, '0'), mode: 'manual', scope: 'hotel' });
  await api.reserveInvoice({ id: 'b2' }, 'k2', 100, 'guest', 1);
  await api.reserveInvoice({ id: 'b3' }, 'k3', 100, 'guest', 1);
  T('Manual: the page asks maha_issue_invoice_number', calls.length === 2 && calls.every(c => c.name === 'maha_issue_invoice_number' && c.body.p_ym === '2026-10' && c.body.target_property === 'P1'));
  T('Manual: the invoice prints the server\'s number INV-000123, INV-000124 (gapless, no counting by the page)', api.invRef(H.invoices[1]) === 'INV-000123' && api.invRef(H.invoices[2]) === 'INV-000124', H.invoices.map(i => i.ref).join(' '));
  T('Manual: the invoice keeps no, ym, ref and its own number (mseq), not a month series number', H.invoices[1].no === 2 && H.invoices[1].ym === '2026-10' && H.invoices[1].mseq === 123 && !('seq' in H.invoices[1]));
  T('Manual: the second call tells the server the highest number it has seen, so the server can only go up', calls[1].body.floor_seq === 124, String(calls[1].body.floor_seq));
  T('Manual works as gapless even if the old checkbox is off', (() => { H.set.gaplessInvoices = false; const r = api.gaplessOn(H); H.set.gaplessInvoices = true; return r })());
  online = false; H.set.gaplessInvoices = false;
  let threw = ''; try { api.taxInvoiceFor({ id: 'b9' }, 'k9', 1, 'guest', 1) } catch (e) { threw = e.message }
  T('Manual never numbers an invoice by itself (no server, no number)', threw === 'GAPLESS_NEEDS_NUMBER' && H.invoices.length === 3);
  online = true; H.set.gaplessInvoices = true;

  /* numbers used up (fixed width) and no format yet: nothing is printed */
  const before = H.invoices.length; calls.length = 0;
  reply = () => { throw mkErr('invoice-numbers-used-up', 400) };
  let err = null; try { await api.reserveInvoice({ id: 'b4' }, 'k4', 100, 'guest', 1) } catch (e) { err = e }
  T('fixed width used up: nothing is issued and the message tells to ask Maha Hub', err && H.invoices.length === before && /Tax invoice numbers are used up - ask Maha Hub/.test(api.gaplessMsg(err)), err && api.gaplessMsg(err));
  reply = () => { throw mkErr('invoice-format-missing', 400) };
  err = null; try { await api.reserveInvoice({ id: 'b5' }, 'k5', 100, 'guest', 1) } catch (e) { err = e }
  T('format not set yet: nothing is issued and the message says so', err && H.invoices.length === before && /format is not set yet/.test(api.gaplessMsg(err)));
  reply = () => { throw mkErr('not found', 404) };
  err = null; try { await api.reserveInvoice({ id: 'b6' }, 'k6', 100, 'guest', 1) } catch (e) { err = e }
  T('Manual never falls back to the old Standard function', err && H.invoices.length === before && calls.every(c => c.name === 'maha_issue_invoice_number'));

  /* switching the mode only affects NEW invoices; old refs never change */
  const oldRefs = H.invoices.map(i => i.ref).join(' ');
  H.set.invMode = 'standard'; calls.length = 0;
  reply = (n, b) => ({ no: b.floor_no, seq: b.floor_seq, ym: b.p_ym });
  await api.reserveInvoice({ id: 'b7' }, 'k7', 100, 'guest', 1);
  T('switching to Standard: the new invoice is TIV-... and the month series goes on from the Standard invoices only', api.invRef(H.invoices[3]) === 'TIV-H1-2026-10-0002' && calls[0].name === 'maha_issue_invoice_ref', api.invRef(H.invoices[3]));
  T('invoices already issued keep their ref', H.invoices.slice(0, 3).map(i => i.ref).join(' ') === oldRefs);
  H.set.invMode = 'manual'; calls.length = 0; nextM = 125;
  reply = (n, b) => ({ no: b.floor_no, mseq: nextM, ym: b.p_ym, ref: 'INV-' + String(nextM++).padStart(6, '0') });
  await api.reserveInvoice({ id: 'b8' }, 'k8', 100, 'guest', 1);
  T('switching back to Manual: goes on after the last Manual number', api.invRef(H.invoices[4]) === 'INV-000125' && calls[0].body.floor_seq === 125);
  H.invoices.push({ no: 99, bookingId: 'old', key: 'old' });
  T('an invoice with no ref shows its plain number', api.invRef(H.invoices[5]) === '99');

  /* Manual and a chain: one shared number, the page prints what the server gives (no hotel code is added) */
  H = mk('H2'); H.set.invMode = 'manual'; env.MahaSync.code = 'H2'; env.MahaSync.pid = 'P2'; calls.length = 0;
  reply = (n, b) => ({ no: b.floor_no, mseq: 5001, ym: b.p_ym, ref: 'GRP-005001', mode: 'manual', scope: 'chain' });
  await api.reserveInvoice({ id: 'c1' }, 'kc1', 100, 'guest', 1);
  T('Manual + chain: the hotel prints the chain\'s number GRP-005001', api.invRef(H.invoices[0]) === 'GRP-005001' && H.invoices[0].mseq === 5001);

  /* ---------------- 2. the settings title (provider only) ---------------- */
  const t0 = src.indexOf(" tiref(box){"), t1 = src.indexOf(" terms(box){VIEWS['prov.terms']");
  const d0 = src.indexOf(" docs(box){");
  if (t0 < 0 || t1 < t0 || d0 < 0 || d0 > t0) throw new Error('settings code not found');
  const tirefCode = src.slice(t0, t1), docsCode = src.slice(d0, t0);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const optF = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l ?? v)}</option>`;
  const fldF = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
  const secHead = (t, d) => `<h2 class="sut">${esc(t)}</h2>${d ? `<p class="sub">${d}</p>` : ''}`;

  /* a very small page: elements by id, with the value / checked / disabled that the html gave them */
  function makePage() {
    const els = {};
    const make = id => ({ id, _v: '', get value() { return this._v }, set value(v) { this._v = String(v) }, checked: false, disabled: false, hidden: false, textContent: '', onclick: null, oninput: null, onchange: null, _html: '',
      set innerHTML(h) { this._html = h; parse(h) }, get innerHTML() { return this._html } });
    const parse = h => {
      for (const m of h.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const id = m[2], tag = m[0], e = els[id] || (els[id] = make(id));
        const v = tag.match(/\bvalue="([^"]*)"/); if (v) e.value = v[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        if (/\bchecked\b/.test(tag)) e.checked = true;
        if (/\bdisabled\b/.test(tag)) e.disabled = true;
        if (m[1] === 'select') { const rest = h.slice(m.index, h.indexOf('</select>', m.index)); const o = rest.match(/<option value="([^"]*)"\s+selected/); if (o) e.value = o[1]; e.options = [...rest.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map(x => ({ v: x[1], disabled: /\bdisabled\b/.test(x[2]) })) }
      }
    };
    const box = make('box');
    const $ = sel => els[sel.replace('#', '')] || null;
    return { box, $, els };
  }
  async function runSection(opts) {
    const o = { cloud: true, active: false, provider: true, set: {}, chain: null, server: null, ...opts };
    const pg = makePage(), calls2 = [], logs = [], toasts = []; let savedN = 0;
    const Hs = { code: 'H1', active: o.active ? undefined : false, set: { name: 'Hotel One', bd: '2026-10-09', nextInv: 7, ...o.set }, invoices: [] };
    if (o.active) Hs.active = true;
    const info = { chains: o.chain ? [{ name: 'Padauk', chain_code: 'PADK2026', invoice_scope: o.chain, hotels: [{ property_code: 'H1' }] }] : [] };
    const e2 = {
      H: Hs, $: pg.$, esc, opt: optF, fld: fldF, secHead, invRefFor: api.invRefFor, invYM: api.invYM, invManualRef: api.invManualRef, invFormatCheck: api.invFormatCheck,
      MahaAuth: { on: () => o.cloud, rpc: async (n, b) => { calls2.push({ rpc: n, b }); if (o.server) return o.server; throw new Error('no') } },
      ChainInfo: { load: () => Promise.resolve(info) }, chainOfHotel: (i, c) => ((i && i.chains) || []).find(x => (x.hotels || []).some(h => h.property_code === c)) || null,
      syncOfHotel: () => o.cloud ? { pid: 'P1', rpc: async () => ({}) } : null,
      ProvAdmin: { call: async b => { calls2.push(b); if (o.fail) throw new Error(o.fail); return { ok: true } }, msg: e => 'MSG:' + e.message },
      provOnly: () => o.provider, provLog: m => logs.push(m), saved: () => { savedN++ }, toast: m => toasts.push(m), modal() { },
    };
    const SEC = new Function('env', 'with(env){const SEC={' + tirefCode + '};return SEC}')(e2);
    SEC.tiref(pg.box); await wait();
    return { pg, Hs, calls: calls2, logs, saved: () => savedN, toasts, html: pg.box.innerHTML };
  }
  const fire = (e, v) => { if (v !== undefined) { if (typeof v === 'boolean') e.checked = v; else e.value = v } if (e.oninput) e.oninput(); if (e.onchange) e.onchange({ target: e }) };

  let R = await runSection({});
  T('the title is named Tax Invoice Reference and numbered 14', /14\. Tax Invoice Reference/.test(R.html));
  T('it offers Standard Tax Invoice Ref and Manual', /Standard Tax Invoice Ref/.test(R.html) && /<option value="manual"/.test(R.html) && R.pg.$('#ti_mode').value === 'standard');
  T('Next tax invoice number (d_inv) and the gapless checkbox (d_gl) live here, with their old ids', !!R.pg.$('#d_inv') && !!R.pg.$('#d_gl') && R.pg.$('#d_inv').value === '7');
  T('they are no longer in the Registration card & invoice section', !/id="d_inv"/.test(docsCode) && !/id="d_gl"/.test(docsCode) && /13\. Registration card & invoice/.test(docsCode));
  T('Standard shows its structure with an example', /TIV-\(hotel code\)-year-month-4 digits/.test(R.html) && /TIV-H1-2026-10-0001/.test(R.html) && R.pg.$('#tiStd').hidden === false && R.pg.$('#tiMan').hidden === true);
  T('a hotel that is in no chain simply has its own series', /not in a chain, so it has its own series/.test(R.pg.$('#tiScope').innerHTML) && !R.pg.$('#ti_scope'));

  /* Manual: typed once, live example */
  fire(R.pg.$('#ti_mode'), 'manual');
  T('Manual shows prefix, starting number, minimum digits (default 6) and the unlimited choice', R.pg.$('#tiMan').hidden === false && R.pg.$('#tiStd').hidden === true && R.pg.$('#ti_min').value === '6' && R.pg.$('#ti_unl').checked === true && /Unlimited increasing of the digits/.test(R.html));
  fire(R.pg.$('#ti_pre'), 'INV-'); fire(R.pg.$('#ti_start'), '123');
  T('live example: INV-000123', R.pg.$('#ti_ex').textContent === 'INV-000123', R.pg.$('#ti_ex').textContent);
  fire(R.pg.$('#ti_min'), '4');
  T('the example follows the minimum digits', R.pg.$('#ti_ex').textContent === 'INV-0123');
  T('Manual makes the gapless choice automatic (ticked and fixed)', R.pg.$('#d_gl').checked === true && R.pg.$('#d_gl').disabled === true);
  fire(R.pg.$('#ti_min'), '6');

  /* validation messages: nothing is sent */
  const tryBad = async (pre, start, min) => { R.calls.length = 0; fire(R.pg.$('#ti_pre'), pre); fire(R.pg.$('#ti_start'), start); fire(R.pg.$('#ti_min'), min); await R.pg.$('#tiSave').onclick(); return { msg: R.pg.$('#tiErr').textContent, sent: R.calls.length } };
  let r = await tryBad('A'.repeat(21), '1', '6'); T('prefix over 20 characters: message, nothing sent', /at most 20/.test(r.msg) && r.sent === 0, r.msg);
  r = await tryBad('INV 1', '1', '6'); T('a space in the prefix: message, nothing sent', /no spaces/.test(r.msg) && r.sent === 0, r.msg);
  r = await tryBad('INV-', '1', '13'); T('13 digits: message, nothing sent', /1 to 12/.test(r.msg) && r.sent === 0, r.msg);
  r = await tryBad('INV-', '0', '6'); T('starting number 0: message, nothing sent', /1 or more/.test(r.msg) && r.sent === 0, r.msg);
  T('nothing was changed in the hotel by the refused saves', R.Hs.set.invMode === undefined && R.saved() === 0);

  /* a good save: ONE trusted call with the format; the hotel remembers Manual and gapless; the provider history says so */
  R.calls.length = 0; fire(R.pg.$('#ti_pre'), 'TAX/2026/'); fire(R.pg.$('#ti_start'), '123'); fire(R.pg.$('#ti_min'), '6'); fire(R.pg.$('#ti_unl'), false);
  await R.pg.$('#tiSave').onclick();
  const fc = R.calls.filter(c => c.action);
  T('save sends set_invoice_format once, with mode, prefix, start, min digits and the unlimited choice', fc.length === 1 && fc[0].action === 'set_invoice_format' && fc[0].property_code === 'H1' && fc[0].mode === 'manual' && fc[0].prefix === 'TAX/2026/' && fc[0].start === 123 && fc[0].min_digits === 6 && fc[0].unlimited === false, JSON.stringify(fc));
  T('the hotel now uses Manual, gapless, and keeps the typed format', R.Hs.set.invMode === 'manual' && R.Hs.set.gaplessInvoices === true && R.Hs.set.invFmt.prefix === 'TAX/2026/' && R.Hs.set.invFmt.start === 123 && R.Hs.set.invFmt.min === 6 && R.Hs.set.invFmt.unl === false && R.saved() === 1);
  T('the change is written in the provider history', R.logs.length === 1 && /Tax Invoice Reference saved for H1/.test(R.logs[0]) && /Manual TAX\/2026\/000123/.test(R.logs[0]) && /fixed width/.test(R.logs[0]), R.logs[0]);

  /* the server's numbers: the page shows the format in use and never allows a starting number below what was issued */
  R = await runSection({ set: { invMode: 'manual', gaplessInvoices: true, invFmt: { prefix: 'INV-', start: 10, min: 6, unl: true } }, server: { mode: 'manual', prefix: 'INV-', start: 10, min_digits: 6, unlimited: true, next_number: 55, issued: 54, scope: 'hotel' } });
  T('the page reads the format from the server and tells the next number', R.pg.$('#ti_start').value === '10' && /Next number: INV-000055/.test(R.pg.$('#tiNote').textContent), R.pg.$('#tiNote').textContent);
  fire(R.pg.$('#ti_start'), '40'); R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  T('a starting number lower than the highest already issued is refused', /highest number already issued \(54\)/.test(R.pg.$('#tiErr').textContent) && R.calls.filter(c => c.action).length === 0, R.pg.$('#tiErr').textContent);
  fire(R.pg.$('#ti_start'), '54'); R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  T('equal to the highest issued is accepted', R.calls.filter(c => c.action === 'set_invoice_format').length === 1 && R.pg.$('#tiErr').textContent === '');

  /* server refusal is shown in plain words and nothing changes in the hotel */
  R = await runSection({ fail: 'start_too_low' });
  fire(R.pg.$('#ti_mode'), 'manual'); fire(R.pg.$('#ti_pre'), 'X-'); fire(R.pg.$('#ti_start'), '5'); await R.pg.$('#tiSave').onclick();
  T('a server refusal is shown and the hotel is not changed', /^MSG:start_too_low/.test(R.pg.$('#tiErr').textContent) && R.Hs.set.invMode === undefined && R.saved() === 0);

  /* locked once the hotel is active */
  R = await runSection({ active: true, set: { invMode: 'manual', gaplessInvoices: true, invFmt: { prefix: 'INV-', start: 10, min: 6, unl: true } } });
  T('active hotel: mode, next number, prefix, start, digits and unlimited are locked', ['#ti_mode', '#d_inv', '#ti_pre', '#ti_start', '#ti_min', '#ti_unl'].every(i => R.pg.$(i).disabled === true));
  R.calls.length = 0; fire(R.pg.$('#ti_pre'), 'CHANGED-'); await R.pg.$('#tiSave').onclick();
  T('active hotel: saving sends nothing to the server and does not change the format or the counter', R.calls.filter(c => c.action).length === 0 && R.Hs.set.invFmt.prefix === 'INV-' && R.Hs.set.nextInv === 7 && R.Hs.set.invMode === 'manual');
  T('active hotel: the page says how to correct it', /deactivate the hotel first/.test(R.html));
  R = await runSection({ active: false });
  T('hotel not yet active: fields are open', ['#ti_mode', '#d_inv', '#ti_pre', '#ti_start', '#ti_min', '#ti_unl'].every(i => R.pg.$(i).disabled === false));

  /* only the provider */
  R = await runSection({ provider: false }); R.calls.length = 0; fire(R.pg.$('#ti_mode'), 'manual'); fire(R.pg.$('#ti_pre'), 'INV-'); fire(R.pg.$('#ti_start'), '1');
  await R.pg.$('#tiSave').onclick();
  T('someone who is not the provider cannot save', R.calls.length === 0 && R.saved() === 0 && R.Hs.set.invMode === undefined);
  const setStaffView = src.slice(src.indexOf("VIEWS['set.hotel']="), src.indexOf("VIEWS['set.hotel']=") + 6000);
  T('the hotel settings of the hotel\'s own staff do not have it', !/tiref|Tax Invoice Reference|d_inv/.test(setStaffView));
  T('only the provider\'s property setup can open it (SEC is used by the provider setup and the provider Direct booking page only)', /VIEWS\['prov\.setup'\]/.test(src) && (src.match(/SEC\[SET_SEC\]/g) || []).length === 1);

  /* Standard / switching / without the cloud */
  R = await runSection({});
  R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  T('Standard saved again: no server call, the old behaviour', R.calls.filter(c => c.action).length === 0 && R.Hs.set.invMode === 'standard' && R.saved() === 1);
  R = await runSection({ cloud: false });
  T('without the cloud Manual cannot be chosen', R.pg.$('#ti_mode').options.find(o => o.v === 'manual').disabled === true);
  R = await runSection({ set: { invMode: 'manual', gaplessInvoices: true, invFmt: { prefix: 'INV-', start: 10, min: 6, unl: true } } });
  fire(R.pg.$('#ti_mode'), 'standard'); R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  T('switching back to Standard tells the server, keeps gapless as it was, and logs it', R.calls.filter(c => c.action === 'set_invoice_format' && c.mode === 'standard').length === 1 && R.Hs.set.invMode === 'standard' && R.Hs.set.gaplessInvoices === true && /Standard/.test(R.logs[0]));

  /* series: one per hotel or one for the whole chain, same title, same saved action */
  R = await runSection({ chain: 'hotel' });
  T('a hotel in a chain sees the series choice here, on "Individual hotel"', !!R.pg.$('#ti_scope') && /Individual hotel/.test(R.pg.$('#tiScope').innerHTML) && /one series for all hotels of Padauk/.test(R.pg.$('#tiScope').innerHTML) && R.pg.$('#ti_scope').value === 'hotel');
  fire(R.pg.$('#ti_scope'), 'chain'); R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  const ac = R.calls.filter(c => c.action);
  T('choosing the chain series saves with set_invoice_scope (chain code and scope), then the format', ac.length === 2 && ac[0].action === 'set_invoice_scope' && ac[0].chain_code === 'PADK2026' && ac[0].scope === 'chain' && ac[1].action === 'set_invoice_format', JSON.stringify(ac));
  T('the series change is also written in the provider history', R.logs.some(l => /chain PADK2026/.test(l) && /whole chain/.test(l)));
  R = await runSection({ chain: 'chain' });
  fire(R.pg.$('#ti_mode'), 'manual'); await wait();
  T('a chain series for Manual: the format is typed once for the whole chain', R.pg.$('#ti_scope').value === 'chain' && /typed once for the whole chain/.test(R.pg.$('#tiNote').textContent));
  fire(R.pg.$('#ti_pre'), 'GRP-'); fire(R.pg.$('#ti_start'), '5000'); R.calls.length = 0; await R.pg.$('#tiSave').onclick();
  T('saving Manual for a chain hotel does not change the chain series again', R.calls.filter(c => c.action === 'set_invoice_scope').length === 0 && R.calls.filter(c => c.action === 'set_invoice_format').length === 1);

  /* ---------------- 3. section list, numbering, menus ---------------- */
  const sl = src.match(/const SET_SECTIONS=\[([\s\S]*?)\];/)[1];
  const secs = [...sl.matchAll(/\['([a-z]+)','(\d+)','([^']+)'\]/g)].map(m => ({ k: m[1], n: +m[2], t: m[3] }));
  T('the section list is numbered 1, 2, 3 ... without a gap', secs.length === 16 && secs.every((s, i) => s.n === i + 1), secs.map(s => s.n).join(','));
  T('Tax Invoice Reference sits next to Registration card & invoice (13, then 14)', secs[12].k === 'docs' && secs[13].k === 'tiref' && secs[13].t === 'Tax Invoice Reference' && secs[14].k === 'terms' && secs[15].k === 'activate');
  T('the heading of every section shows its own number', (() => {
    const heads = { docs: "secHead('13. Registration card & invoice')", tiref: "secHead('14. Tax Invoice Reference'", terms: "secHead('15. Terms & Conditions')", activate: "secHead('16. Review & activate'", plan: "secHead('7. Floor plan'" };
    return Object.values(heads).every(h => src.includes(h)) && !/secHead\('1[45]\. (Terms|Review)/.test(src.replace("secHead('15. Terms", '').replace("secHead('16. Review", ''));
  })());
  T('the old texts that named section 14 for the Terms are updated', /Terms & Conditions \(section 15\)/.test(src) && !/Terms & Conditions \(section 14\)/.test(src));
  const pm = src.slice(src.indexOf('const PROV_MENU=['), src.indexOf('const VIEWS={}'));
  T('the provider Setup menu has its own title Chains / Groups', /\['Chains \/ Groups','prov\.chains'\]/.test(pm) && /\['Recycle bin','prov\.recycle'\]/.test(pm) && pm.indexOf("'Chains / Groups'") < pm.indexOf("'Recycle bin'"));
  const pc = src.indexOf("VIEWS['prov.chains']"), rb = src.indexOf("VIEWS['prov.recycle']"), cbk = src.indexOf('/* Chain / Group panel');
  T('Chains / Groups is a page of its own, and shows the Chain / Group panel', pc > 0 && /chainBlock\(\$\('#chainBox',el\)\)/.test(src.slice(pc, pc + 1800)) && /pageHead\('Chains \/ Groups'/.test(src.slice(pc, pc + 1800)));
  const recycleCode = src.slice(rb, cbk);
  T('the Recycle bin page now shows only the deleted hotels', !/chainBlock|Chain \/ Group|invoice_scope|Tax invoice numbers/.test(recycleCode));
  const profile = src.slice(src.indexOf(" profile(box){"), src.indexOf(" tax(box){"));
  T('the hotel profile no longer holds the Chain / Group panel', !/chainBox|chainBlock/.test(profile));

  /* ---------------- 4. the server side ---------------- */
  const mig = fs.readFileSync('supabase/migrations/20261016_021_invoice_manual_format.sql', 'utf8');
  T('migration 020 is additive: new columns, new functions, the old ones are not replaced', /add column if not exists invoice_mode/.test(mig) && !/create or replace function public\.maha_issue_invoice_ref/.test(mig) && !/create or replace function public\.maha_issue_invoice_no/.test(mig) && /maha_issue_invoice_number/.test(mig) && /maha_set_invoice_format/.test(mig));
  T('the format can only be set by the trusted function (service role), the number only by signed-in users', /revoke all on function public\.maha_set_invoice_format[^;]*from public, anon, authenticated/.test(mig) && /grant execute on function public\.maha_set_invoice_format[^;]*to service_role/.test(mig) && /grant execute on function public\.maha_issue_invoice_number[^;]*to authenticated/.test(mig));
  const fn = fs.readFileSync('supabase/functions/platform-admin-provision/index.ts', 'utf8');
  T('the provider function has set_invoice_format, checks the values and logs it', /action === "set_invoice_format"/.test(fn) && /maha_set_invoice_format/.test(fn) && /invoice_format_changed/.test(fn) && /start < 1/.test(fn) && /minDigits > 12/.test(fn) && /\{0,20\}/.test(fn));
  const wf = fs.readFileSync('.github/workflows/tenant-cloud-storage-tests.yml', 'utf8');
  T('CI applies migration 020 and runs the new SQL and page tests', /20261016_021_invoice_manual_format\.sql/.test(wf) && /invoice_manual_format_test\.sql/.test(wf) && /taxref-test\.js/.test(wf));

  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
