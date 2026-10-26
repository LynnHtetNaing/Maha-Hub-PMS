/* Nobody gets into Maha Connect, Reach or Sales from the website or by typing the address: they open only from the signed-in
   Main page. No network.   node tests/sync/entrygate-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* 1. the website never links into a system */
const site = ['index', 'about', 'maha-hub-solutions', 'products', 'pricing', 'security', 'maha-hub-academy', 'contact', 'privacy', 'terms', 'refund', '404'];
const bad = [];
site.forEach(p => { for (const m of read(p + '.html').matchAll(/href="([^"]*)"/g)) if (/^\/(ecosystem|reach|connect|sales|book|edc-link)(\/|$)/i.test(m[1]) || /^\/solutions-PMS/i.test(m[1])) bad.push(p + ': ' + m[1]); });
T('no website page links to a system (only to the Main sign-in page /solutions)', bad.length === 0, bad.join(' ; '));
T('the Products page has a plain Sign in for every product, going to /solutions', (read('products.html').match(/href="\/solutions">Sign in<\/a>/g) || []).length >= 5);
T('the website generator no longer holds system addresses', !/ecosystem\/(Connect|Booking|Reach|Sales)/.test(read('website/build.mjs')));
const robots = read('robots.txt');
T('search engines are told to stay out of the systems', ['/ecosystem/', '/reach/', '/connect/', '/sales/', '/edc-link/'].every(p => robots.includes('Disallow: ' + p)));

/* 2. the gate in each system, run for real */
function runGate(kind, { ticket, search = '', now = 1e12, fresh = false } = {}) {
  const html = read(kind + '/index.html');
  const m = html.match(/<script>\/\* Maha entry gate[\s\S]*?<\/script>/);
  if (!m) return { missing: true };
  const store = {}; if (ticket !== undefined) store['mahahub.entry.' + kind] = typeof ticket === 'string' ? ticket : JSON.stringify(ticket);
  const out = { redirects: [], hidden: false, intervals: [] };
  const sandbox = {
    localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } },
    location: { search, replace: u => out.redirects.push(u) },
    document: { documentElement: { style: {} } },
    URLSearchParams, Date: { now: () => now }, JSON,
    setInterval: fn => out.intervals.push(fn),
  };
  vm.createContext(sandbox); vm.runInContext(m[0].replace(/^<script>|<\/script>$/g, ''), sandbox);
  out.hidden = sandbox.document.documentElement.style.display === 'none'; out.store = store; out.sandbox = sandbox; return out;
}
for (const kind of ['reach', 'sales', 'connect']) {
  const html = read(kind + '/index.html');
  const gateAt = html.indexOf('Maha entry gate'), firstOther = html.search(/<script(?![^>]*>\/\* Maha entry gate)/);
  T(kind + ': the gate is the first thing in the page, before any other script', gateAt > 0 && html.indexOf('<script>/* Maha entry gate') < (html.indexOf('<script', html.indexOf('</script>', gateAt) + 1) === -1 ? Infinity : html.indexOf('<script', html.indexOf('</script>', gateAt) + 1)));
  let g = runGate(kind, {});
  T(kind + ': typed address, no ticket -> sent to /solutions and the page is hidden', g.redirects[0] === '/solutions' && g.hidden);
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1', owner: true } });
  T(kind + ': ticket from the Main page -> opens', g.redirects.length === 0 && !g.hidden);
  g = runGate(kind, { ticket: { at: 1e12 - 13 * 3600 * 1000, hotel: 'H1', owner: true } });
  T(kind + ': ticket older than 12 hours -> sent to /solutions', g.redirects[0] === '/solutions');
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1', owner: true }, search: '?hotel=H2' });
  T(kind + ': ticket is for another hotel than the address says -> sent to /solutions', g.redirects[0] === '/solutions');
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1', owner: true }, search: '?hotel=H1' });
  T(kind + ': ticket for the same hotel -> opens', g.redirects.length === 0);
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1' } });
  T(kind + ': a ticket not made by the Owner (system not released yet) -> sent to /solutions', g.redirects[0] === '/solutions');
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1', owner: false } });
  T(kind + ': a ticket marked as not the Owner -> sent to /solutions', g.redirects[0] === '/solutions');
  g = runGate(kind, { ticket: 'not json{' });
  T(kind + ': a damaged ticket -> sent to /solutions', g.redirects[0] === '/solutions');
  g = runGate(kind, { ticket: { at: 1e12 - 1000, hotel: 'H1', owner: true } });
  delete g.store['mahahub.entry.' + kind]; g.intervals.forEach(f => f());
  T(kind + ': after sign-out (ticket removed) an open page is sent away within seconds', g.redirects[0] === '/solutions' && g.intervals.length === 1);
}
T('Maha Booking (the page guests use to book) stays open to guests, as before', !/Maha entry gate/.test(read('book/index.html')));

/* 3. the Main page leaves and removes the ticket */
const cut = (a, b) => { const i = app.indexOf(a), j = app.indexOf(b, i); if (i < 0 || j < 0) throw new Error('cut ' + a); return app.slice(i, j) };
const code = cut('/* Entry ticket: Maha Connect', 'function applySysPath(') || '';
const store = {};
const env = { DB: { session: { hotel: 'H1', provider: true } }, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } }, Date: { now: () => 1e12 }, JSON, ecosystemDir: () => '/ecosystem/', sysSegment: k => ({ connect: 'Connect', reach: 'Reach', sales: 'Sales', book: 'Booking' }[k]), appPrefix: () => '' };
const api = new Function('env', 'with(env){' + code + ';return {sysUrl,entryTicket,clearEntryTickets,sysAllowed,RELEASED_SYSTEMS}}')(env);
const h1 = { code: 'H1' };
api.sysUrl('reach', h1);
T('opening Reach from the Main page leaves a ticket for that hotel', JSON.parse(store['mahahub.entry.reach'] || 'null') && JSON.parse(store['mahahub.entry.reach']).hotel === 'H1' && JSON.parse(store['mahahub.entry.reach']).at === 1e12);
api.sysUrl('connect', h1); api.sysUrl('sales', h1);
T('Connect and Sales get tickets too', !!store['mahahub.entry.connect'] && !!store['mahahub.entry.sales']);
env.DB.session = { hotel: 'H1' }; api.clearEntryTickets(); api.sysUrl('reach', h1); api.sysUrl('connect', h1); api.sysUrl('sales', h1);
T('a hotel user (not the Owner) gets no ticket while the systems are not released', Object.keys(store).length === 0);
T('only the PMS is released', api.RELEASED_SYSTEMS.length === 1 && api.RELEASED_SYSTEMS[0] === 'hub');
T('the PMS opens for a hotel user, the others do not', api.sysAllowed('hub') && !api.sysAllowed('reach') && !api.sysAllowed('connect') && !api.sysAllowed('sales') && !api.sysAllowed('book'));
env.DB.session = { hotel: 'H1', provider: true };
T('the Owner (provider) can open every system', ['hub', 'reach', 'connect', 'sales', 'book'].every(k => api.sysAllowed(k)));
api.sysUrl('reach', h1);
T('the address built still has the hotel in it', api.sysUrl('reach', h1).endsWith('?hotel=H1'));
const before = Object.keys(store).length; api.sysUrl('book', h1); api.sysUrl('hub', h1);
T('Booking (for guests) and the PMS need no ticket', Object.keys(store).length === before);
api.clearEntryTickets();
T('signing out removes every ticket', Object.keys(store).length === 0);
env.DB.session = null; api.sysUrl('reach', h1);
T('nobody signed in -> no ticket is made', Object.keys(store).length === 0);
T('every way of ending a session removes the tickets (sign-out, expiry, 1 hour idle, session end)', (app.match(/clearEntryTickets\(\);/g) || []).length >= 4 && /function endLiveSession\(\)\{\r?\n  clearEntryTickets\(\)/.test(app));
process.exit(fails ? 1 : 0);
