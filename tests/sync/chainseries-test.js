/* Chain tax-invoice series: the page prints what the server gives (hotel code in front, the chain's shared number), and only the provider
   sees and uses the choice "one series per hotel / one series for the whole chain" on the chain screen. No network.
     node tests/sync/chainseries-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };

/* ---- the invoice side: the server decides the number, the page prints invRefFor(hotel code, month, number) ---- */
const a = src.indexOf('/* The number printed on a tax invoice'), b = src.indexOf('function companyLine');
if (a < 0 || b < a) throw new Error('invoice code not found');
const code = src.slice(a, b);
const mk = c => ({ code: c, set: { bd: '2026-10-09', nextInv: 1, gaplessInvoices: true }, invoices: [] });
let H = mk('H1');
const calls = [];
let chainSeq = 0;
const env = {
  get H() { return H },
  MahaAuth: { on: () => true },
  MahaSync: { code: 'H1', pid: 'P1', rpc: async (name, body) => { calls.push({ name, body }); return { no: body.floor_no, seq: ++chainSeq, ym: body.p_ym, scope: 'chain' } } },
  ProvSync: { items: new Map() }, user: () => ({ name: 'Ann' }), curShift: () => null, saveDB() { },
};
const api = new Function('env', 'with(env){' + code + ';return {reserveInvoice,invRef}}')(env);
const B1 = { id: 'b1' }, B2 = { id: 'b2' }, B3 = { id: 'b3' };

(async () => {
  /* hotel 1 takes chain number 1; then hotel 2 (another file, another code) takes 2; hotel 1 again takes 3 although its own list has only 1 invoice */
  await api.reserveInvoice(B1, 'k1', 100, 'guest', 1);
  const h1 = H;
  H = mk('H2'); env.MahaSync.code = 'H2'; env.MahaSync.pid = 'P2';
  await api.reserveInvoice(B1, 'k1', 100, 'guest', 1);
  const h2 = H;
  H = h1; env.MahaSync.code = 'H1'; env.MahaSync.pid = 'P1';
  await api.reserveInvoice(B2, 'k2', 100, 'guest', 1);
  T('chain series: the hotel code stays in front, the number is the chain\'s: TIV-H1-2026-10-0001, TIV-H2-2026-10-0002, TIV-H1-2026-10-0003',
    api.invRef(h1.invoices[0]) === 'TIV-H1-2026-10-0001' && api.invRef(h2.invoices[0]) === 'TIV-H2-2026-10-0002' && api.invRef(h1.invoices[1]) === 'TIV-H1-2026-10-0003',
    [h1.invoices[0].ref, h2.invoices[0].ref, h1.invoices[1].ref].join(' '));
  T('the page keeps the number the server gave (it does not count by itself)', h1.invoices[1].seq === 3 && h1.invoices[1].ym === '2026-10');
  T('the page asks the server for this hotel and month; the server knows the chain', calls.every(c => c.name === 'maha_issue_invoice_ref' && c.body.p_ym === '2026-10') && calls[0].body.target_property === 'P1' && calls[1].body.target_property === 'P2');
  T('the page sends nothing about a chain choice (only the provider sets it, on the server)', calls.every(c => !('scope' in c.body) && !('p_scope' in c.body) && Object.keys(c.body).sort().join() === 'floor_no,floor_seq,p_ym,target_property'));

  /* ---- the provider's choice on the chain screen ---- */
  const c0 = src.indexOf('function chainBlock('), c1 = src.indexOf('/* A new chain:');
  if (c0 < 0 || c1 < c0) throw new Error('chain screen code not found');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const optF = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l ?? v)}</option>`;
  const fldF = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
  const run = async (scope, isProvider, pick, inChain = true) => {
    const els = {}; const mkEl = () => ({ value: '', textContent: '', onclick: null });
    const el = { _h: '', set innerHTML(h) { this._h = h; for (const k of Object.keys(els)) delete els[k] }, get innerHTML() { return this._h } };
    const $ = (sel) => { const id = sel.replace('#', ''); if (!new RegExp('id="' + id + '"').test(el._h)) return null; return els[id] || (els[id] = mkEl()) };
    const callsP = [], logs = [];
    const info = { chains: [{ name: 'Padauk', chain_code: 'PADK2026', invoice_scope: scope, hotels: [{ property_code: 'H1' }] }] };
    const e2 = {
      MahaAuth: { on: () => true }, H: { code: inChain ? 'H1' : 'ZZZ01' }, $, esc, opt: optF, fld: fldF,
      chainOfHotel: (i, c) => ((i && i.chains) || []).find(x => (x.hotels || []).some(h => h.property_code === c)) || null, chainLabel: c => c ? c.name + ' (' + c.chain_code + ')' : '',
      ChainInfo: { load: () => Promise.resolve(info) }, provOnly: () => isProvider, provLog: m => logs.push(m), toast() { }, saveDB() { }, newChainForm() { },
      ProvAdmin: { call: async b => { callsP.push(b); return { ok: true } }, msg: e => e.message },
    };
    new Function('env', 'with(env){' + src.slice(c0, c1) + ';chainBlock(env.el)}')({ ...e2, el });
    await new Promise(r => setTimeout(r, 5));
    const html = el.innerHTML;
    if (pick !== undefined && $('#isGo')) { $('#isSel').value = pick; await $('#isGo').onclick(); await new Promise(r => setTimeout(r, 5)) }
    return { html, callsP, logs };
  };
  let r = await run('hotel', true);
  T('the chain screen offers "Tax invoice numbers": one series per hotel / one series for the whole chain', /Tax invoice numbers/.test(r.html) && /One series per hotel/.test(r.html) && /One series for the whole chain/.test(r.html));
  T('a chain on the default shows "one series per hotel" chosen', /<option value="hotel" selected>/.test(r.html) && !/<option value="chain" selected>/.test(r.html));
  r = await run('chain', true);
  T('a chain that shares one series shows that chosen', /<option value="chain" selected>/.test(r.html) && !/<option value="hotel" selected>/.test(r.html));
  T('the choice is explained in plain words with the example numbers', /TIV-H1-2026-10-0001 then TIV-H2-2026-10-0002/.test(r.html) && /never changed/.test(r.html));
  r = await run('hotel', true, 'chain');
  T('provider saves the whole-chain series: one call to the trusted function with chain code and scope', r.callsP.length === 1 && r.callsP[0].action === 'set_invoice_scope' && r.callsP[0].chain_code === 'PADK2026' && r.callsP[0].scope === 'chain', JSON.stringify(r.callsP));
  T('the change is written in the provider\'s own log', r.logs.length === 1 && /PADK2026/.test(r.logs[0]));
  r = await run('chain', true, 'hotel');
  T('provider can go back to one series per hotel', r.callsP.length === 1 && r.callsP[0].scope === 'hotel');
  r = await run('chain', true, 'chain');
  T('choosing what is already set does nothing', r.callsP.length === 0);
  r = await run('hotel', false, 'chain');
  T('someone who is not the provider cannot save it', r.callsP.length === 0);
  r = await run('hotel', true, undefined, false);
  T('a hotel that is in no chain has no such choice', !/Tax invoice numbers/.test(r.html) && !/isGo/.test(r.html));
  T('the provider-only service call and its message exist in the page', /ProvAdmin\.call\(\{action:'set_invoice_scope'/.test(src));

  /* ---- the trusted function knows the action and logs it ---- */
  const fn = fs.readFileSync('supabase/functions/platform-admin-provision/index.ts', 'utf8');
  T('the provider function has the set_invoice_scope action, checks the value and logs it', /action === "set_invoice_scope"/.test(fn) && /scope !== "hotel" && scope !== "chain"/.test(fn) && /invoice_series_changed/.test(fn) && /maha_set_invoice_scope/.test(fn));

  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
