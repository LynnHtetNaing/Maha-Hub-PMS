/* Gapless tax-invoice numbers: client logic against a fake server that behaves like maha_issue_invoice_no().
   Usage: node tests/sync/gapless-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Gapless tax-invoice numbers');
const t = src.indexOf('function taxInvoiceFor(');
if (a < 0 || t < 0) throw new Error('gapless code not found');
const code = src.slice(a, src.indexOf('\n', t));

let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

/* fake server: one counter per property, taken atomically; can be switched offline or to an error */
const server = { counters: new Map(), register: [], mode: 'ok' };
function issue(property, floor) {
  if (server.mode === 'offline') throw new TypeError('Failed to fetch');
  if (server.mode === 'denied') { const e = new Error('property-write-denied'); e.status = 403; throw e; }
  const cur = Math.max(server.counters.get(property) || 0, floor || 1, 1);
  server.counters.set(property, cur + 1);
  server.register.push({ property, no: cur });
  return { no: cur };
}

function device(hotelCode, pid, hotelSet) {
  const ctx = { saved: 0, H: { code: hotelCode, set: Object.assign({ nextInv: 101, bd: '2026-10-10' }, hotelSet), invoices: [] } };
  const MahaSync = { code: hotelCode, pid, rpc: async (name, body) => { if (name !== 'maha_issue_invoice_no') throw new Error('rpc ' + name); return issue(body.target_property, body.floor_value); } };
  const ProvSync = { items: new Map() };
  const body = `
    let H=ctx.H;const MahaAuth={on:()=>true};
    const user=()=>({name:'Front Desk'});const curShift=()=>({name:'Morning'});const saveDB=()=>{ctx.saved++};
    ${code}
    ctx.api={gaplessOn,syncOfHotel,invoiceExists,gaplessMsg,reserveInvoice,taxInvoiceFor,setH:h=>{H=h}};
  `;
  new Function('ctx', 'MahaSync', 'ProvSync', body)(ctx, MahaSync, ProvSync);
  ctx.MahaSync = MahaSync; ctx.ProvSync = ProvSync;
  return ctx;
}
const B1 = { id: 'b1' }, B2 = { id: 'b2' }, B3 = { id: 'b3' };

(async () => {
  /* normal hotels are unchanged */
  const N = device('NORM', 'P-NORM', {});
  const inv0 = N.api.taxInvoiceFor(B1, 'k1', 100, 'guest', 1);
  T('hotel without the switch: old numbering (next number counter) is unchanged', inv0.no === 101 && N.H.set.nextInv === 102 && !N.api.gaplessOn(N.H));

  /* gapless hotel A */
  const A = device('HA', 'P-A', { gaplessInvoices: true, nextInv: 101 });
  T('switch on -> gapless mode', A.api.gaplessOn(A.H) === true);
  let threw = '';
  try { A.api.taxInvoiceFor(B1, 'k1', 100, 'guest', 1); } catch (e) { threw = e.message; }
  T('a local number can never be used by accident in gapless mode', threw === 'GAPLESS_NEEDS_NUMBER' && A.H.invoices.length === 0 && A.H.set.nextInv === 101, threw);

  await A.api.reserveInvoice(B1, 'k1', 100, 'guest', 1);
  await A.api.reserveInvoice(B2, 'k2', 250, 'guest', 1);
  T('numbers come from the server, consecutive, starting at the hotel start number', A.H.invoices.map(i => i.no).join() === '101,102', A.H.invoices.map(i => i.no).join());
  const again = A.api.taxInvoiceFor(B1, 'k1', 100, 'guest', 1);
  T('re-printing the same invoice reuses its number (no new number taken)', again.no === 101 && again.prints === 1 && server.register.length === 2);
  await A.api.reserveInvoice(B1, 'k1', 100, 'guest', 1);
  T('asking again for an existing invoice takes no number', server.register.length === 2 && A.H.invoices.length === 2);
  T('invoice record carries the usual fields', A.H.invoices[0].bookingId === 'b1' && A.H.invoices[0].user === 'Front Desk' && A.H.invoices[0].shift === 'Morning' && A.H.invoices[0].billTo === 'guest' && A.H.invoices[0].amount === 100);
  T('displayed "next number" follows the server', A.H.set.nextInv === 103, String(A.H.set.nextInv));

  /* a second hotel has its OWN sequence */
  const Bh = device('HB', 'P-B', { gaplessInvoices: true, nextInv: 4061 });
  await Bh.api.reserveInvoice(B1, 'k1', 10, 'guest', 1);
  T('another hotel starts its own sequence and does not disturb the first', Bh.H.invoices[0].no === 4061 && server.counters.get('P-A') === 103);

  /* two devices of the same hotel at the same time: no duplicates, no gaps */
  const A2 = device('HA', 'P-A', { gaplessInvoices: true, nextInv: 101 });
  A2.H.invoices = JSON.parse(JSON.stringify(A.H.invoices));
  await Promise.all([A.api.reserveInvoice(B3, 'kA', 1, 'guest', 1), A2.api.reserveInvoice(B3, 'kB', 1, 'guest', 1)]);
  await Promise.all([A.api.reserveInvoice({ id: 'b4' }, 'k4', 1, 'guest', 1), A2.api.reserveInvoice({ id: 'b5' }, 'k5', 1, 'guest', 1)]);
  const all = server.register.filter(r => r.property === 'P-A').map(r => r.no).sort((x, y) => x - y);
  T('two devices at once: every number is used once, and there is no gap', all.join() === '101,102,103,104,105,106', all.join());

  /* offline: nothing is printed and no number is used */
  const before = server.register.length;
  server.mode = 'offline';
  let off = null;
  try { await A.api.reserveInvoice({ id: 'b9' }, 'k9', 5, 'guest', 1); } catch (e) { off = e; }
  T('offline: the invoice is refused and no number is taken', !!off && server.register.length === before && !A.api.invoiceExists(A.H, { id: 'b9' }, 'k9'));
  T('offline message says an internet connection is needed', /internet connection/.test(A.api.gaplessMsg(off)) && /Nothing was printed/.test(A.api.gaplessMsg(off)));
  const noSync = device('HC', 'P-C', { gaplessInvoices: true });
  noSync.MahaSync.pid = null; noSync.MahaSync.code = null;
  let ns = null;
  try { await noSync.api.reserveInvoice(B1, 'k1', 5, 'guest', 1); } catch (e) { ns = e; }
  T('no cloud connection at all: refused with the same clear message', !!ns && /internet connection/.test(noSync.api.gaplessMsg(ns)));

  /* a server error: different message, still nothing printed, no number used */
  server.mode = 'denied';
  let den = null;
  try { await A.api.reserveInvoice({ id: 'b10' }, 'k10', 5, 'guest', 1); } catch (e) { den = e; }
  T('server refusal: clear message, no invoice, no number', !!den && /could not be reserved/.test(A.api.gaplessMsg(den)) && server.register.length === before);
  server.mode = 'ok';
  await A.api.reserveInvoice({ id: 'b9' }, 'k9', 5, 'guest', 1);
  const last = server.register.filter(r => r.property === 'P-A').map(r => r.no).sort((x, y) => x - y);
  T('after the connection returns the sequence continues without a gap', last.join() === '101,102,103,104,105,106,107', last.join());

  /* switching on later never reuses an existing number */
  const Late = device('HL', 'P-L', { gaplessInvoices: true, nextInv: 50 });
  Late.H.invoices = [{ no: 77, bookingId: 'x', key: 'old' }];
  await Late.api.reserveInvoice(B1, 'k1', 5, 'guest', 1);
  T('turning it on for a hotel that already has invoices starts above the highest existing number', Late.H.invoices[1].no === 78, String(Late.H.invoices[1].no));

  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
