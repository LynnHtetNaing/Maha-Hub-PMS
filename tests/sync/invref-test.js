/* Tax invoice number: TIV-(hotel code)-year-month-4 digits, a series per hotel that restarts each month. No network. */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* The number printed on a tax invoice'), b = src.indexOf('function companyLine');
if (a < 0 || b < a) throw new Error('cut');
const code = src.slice(a, b);
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const mk = (codeName, bd) => ({ code: codeName, set: { bd, nextInv: 1 }, invoices: [] });
let H = mk('H1', '2026-10-09');
const calls = [];
const env = {
  get H() { return H },
  MahaAuth: { on: () => true },
  MahaSync: { code: 'H1', pid: 'P1', rpc: async (name, body) => { calls.push({ name, body }); return env.serverReply(name, body) } },
  ProvSync: { items: new Map() }, user: () => ({ name: 'Ann' }), curShift: () => null, saveDB() { },
  serverReply: () => { throw new Error('no server') },
};
const api = new Function('env', 'with(env){' + code + ';return {invRefFor,invRef,invYM,nextMonthSeq,taxInvoiceFor,reserveInvoice,gaplessOn}}')(env);
const B = { id: 'b1' }, B2 = { id: 'b2' };

T('first number is TIV-H1-2026-10-0001', api.invRefFor('H1', '2026-10', 1) === 'TIV-H1-2026-10-0001');
T('hotel code is in capitals, 4 digits, month with two digits', api.invRefFor('padauk2', '2027-01', 42) === 'TIV-PADAUK2-2027-01-0042' && api.invRefFor('H1', '2026-12', 1234) === 'TIV-H1-2026-12-1234');
T('a number past 9999 is not cut', api.invRefFor('H1', '2026-10', 12345) === 'TIV-H1-2026-10-12345');
T('an old invoice without a ref still shows its plain number', api.invRef({ no: 6 }) === '6' && api.invRef(null) === '');
T('year-month comes from the business date', api.invYM('2026-10-31') === '2026-10' && api.invYM('2027-01-01') === '2027-01');

/* normal (non-gapless) hotel: local counter */
H.set.gaplessInvoices = false;
const noCloud = { get H() { return H }, MahaAuth: { on: () => false }, MahaSync: env.MahaSync, ProvSync: env.ProvSync, user: env.user, curShift: env.curShift, saveDB() { } };
const api2 = new Function('env', 'with(env){' + code + ';return {taxInvoiceFor}}')(noCloud);
const i1 = api2.taxInvoiceFor(B, 'k1', 100, 'guest', 1);
T('first invoice of the month: TIV-H1-2026-10-0001', i1.ref === 'TIV-H1-2026-10-0001' && i1.no === 1 && i1.seq === 1 && i1.ym === '2026-10');
const again = api2.taxInvoiceFor(B, 'k1', 100, 'guest', 1);
T('asking again for the same invoice keeps the number (a reprint is not a new number)', again === i1 && H.invoices.length === 1 && i1.prints === 2);
const i2 = api2.taxInvoiceFor(B2, 'k2', 50, 'guest', 1);
T('second invoice of the month: 0002', i2.ref === 'TIV-H1-2026-10-0002' && i2.no === 2);
H.set.bd = '2026-11-02';
const i3 = api2.taxInvoiceFor(B, 'k3', 70, 'guest', 1);
T('a new month starts again at 0001 (overall number goes on)', i3.ref === 'TIV-H1-2026-11-0001' && i3.no === 3);
T('earlier invoices keep their own number', i1.ref === 'TIV-H1-2026-10-0001' && i2.ref === 'TIV-H1-2026-10-0002');
const other = mk('H2', '2026-10-09');
const hOld = H; H = other;
const j1 = api2.taxInvoiceFor(B, 'k1', 10, 'guest', 1);
H = hOld;
T('another hotel has its own series with its own code', j1.ref === 'TIV-H2-2026-10-0001');

/* gapless hotel: the server gives both numbers */
(async () => {
  H = mk('H1', '2026-10-09'); H.set.gaplessInvoices = true; calls.length = 0;
  let seq = 0, no = 0;
  env.serverReply = (name, body) => { if (name === 'maha_issue_invoice_ref') return { no: ++no, seq: ++seq, ym: body.p_ym }; throw new Error('unexpected ' + name) };
  T('gapless is on for this hotel when signed in', api.gaplessOn(H) === true);
  await api.reserveInvoice(B, 'k1', 100, 'guest', 1);
  await api.reserveInvoice(B2, 'k2', 100, 'guest', 1);
  T('gapless: the server gives the numbers and the page prints TIV-H1-2026-10-0001 / 0002', H.invoices[0].ref === 'TIV-H1-2026-10-0001' && H.invoices[1].ref === 'TIV-H1-2026-10-0002' && H.invoices[0].no === 1 && H.invoices[1].no === 2);
  T('gapless: asks the server for this business month and a floor from what is already here', calls[0].name === 'maha_issue_invoice_ref' && calls[0].body.p_ym === '2026-10' && calls[0].body.floor_seq === 1 && calls[1].body.floor_seq === 2);
  T('gapless: already-issued invoice is not issued twice', (await api.reserveInvoice(B, 'k1', 100, 'guest', 1), calls.length === 2));
  /* a server that has not been updated yet: the old function is used, the page still prints the new reference */
  H = mk('H1', '2026-10-09'); H.set.gaplessInvoices = true; calls.length = 0;
  env.serverReply = (name, body) => { if (name === 'maha_issue_invoice_ref') { const e = new Error('not found'); e.status = 404; throw e } return { no: 7 } };
  await api.reserveInvoice(B, 'k1', 100, 'guest', 1);
  T('older server (no month series yet): falls back and still prints TIV-H1-2026-10-0001', H.invoices[0].ref === 'TIV-H1-2026-10-0001' && H.invoices[0].no === 7 && calls.length === 2);
  /* any other error must stop, not make a number up */
  H = mk('H1', '2026-10-09'); H.set.gaplessInvoices = true;
  env.serverReply = () => { const e = new Error('down'); e.status = 503; throw e };
  let stopped = false; try { await api.reserveInvoice(B, 'k1', 100, 'guest', 1) } catch (e) { stopped = true }
  T('server error: no number is made up, nothing is saved', stopped && H.invoices.length === 0);

  /* the screens and reports use the printed reference */
  const uses = [
    ['tax invoice heading', /<b>TAX INVOICE NO\. \$\{invRef\(spec\.inv\)\} \(\$\{label\}\)<\/b>/],
    ['receipt / invoice window title', /\+' '\+invRef\(spec\.inv\)\)\}/],
    ['folio list pill', /\$\{inv\?invRef\(inv\):0\}/],
    ['tax invoice report table', /<td>\$\{invRef\(x\.i\)\}<\/td>/],
    ['tax invoice report CSV', /rows\.map\(x=>\[invRef\(x\.i\),x\.i\.bd,/],
    ['revenue / invoice list', /c:\[invRef\(z\.i\),fd\(z\.i\.bd\)/],
    ['hotel export', /return \[invRef\(i\),i\.bd,no,/],
    ['reservation list', /\.map\(invRef\)\.join\(' '\)/],
  ];
  uses.forEach(([n, re]) => T('uses the printed reference: ' + n, re.test(src)));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
