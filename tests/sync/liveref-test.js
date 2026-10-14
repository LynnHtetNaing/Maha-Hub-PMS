/* A change that arrives from another device must never replace an object an open Post / Payment window is holding.
   It is copied into the same object, and a record that is already the same is left alone (no "Updated from another device" for your own saves).
     node tests/sync/liveref-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---------- record-level sync engine'), b = src.indexOf('/* ---------- end record-level sync engine');
if (a < 0 || b < 0) throw new Error('engine markers missing');
const engine = src.slice(a, b);
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

function makeServer() {
  const recs = new Map(), counters = new Map(); let seq = 0;
  return {
    recs, counters,
    push(changes) {
      const applied = [], conflicts = [];
      for (const ch of changes) {
        const id = ch.collection + '\u0001' + ch.key, cur = recs.get(id), base = ch.base_version || 0, del = !!ch.deleted;
        if (!cur) { if (base !== 0) { conflicts.push({ collection: ch.collection, key: ch.key, version: 0, deleted: true, data: null }); continue } recs.set(id, { collection: ch.collection, key: ch.key, data: del ? null : ch.data, deleted: del, version: 1, seq: ++seq }); applied.push({ collection: ch.collection, key: ch.key, version: 1, seq }) }
        else if (cur.version !== base) conflicts.push({ collection: ch.collection, key: ch.key, version: cur.version, deleted: cur.deleted, data: cur.data });
        else { cur.data = del ? null : ch.data; cur.deleted = del; cur.version++; cur.seq = ++seq; applied.push({ collection: ch.collection, key: ch.key, version: cur.version, seq }) }
      } return { applied, conflicts, seq }
    },
    pull(since, page) { const all = [...recs.values()].filter(r => r.seq > since).sort((x, y) => x.seq - y.seq).slice(0, page); const mx = all.length ? all[all.length - 1].seq : since; return { records: JSON.parse(JSON.stringify(all)), seq: mx, head: seq, more: mx < seq } },
    lease(name, floor, n) { const c = counters.get(name) || 0; const start = Math.max(c, floor, 1); counters.set(name, start + n); return { start, end: start + n - 1 } }
  };
}
function device(server) {
  const ls = {}; const localStorage = { getItem: k => k in ls ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v) }, removeItem: k => { delete ls[k] } };
  const ctx = { DB: { hotels: {}, providers: [] }, toasts: [] };
  const MahaAuth = { async rpc(n, body) { if (n === 'maha_sync_pull') return server.pull(body.since, body.page_size); if (n === 'maha_sync_push') return server.push(body.changes); if (n === 'maha_lease_numbers') return server.lease(body.counter_name, body.floor_value, body.block_size); throw new Error('rpc ' + n) } };
  const api = new Function('ctx', 'localStorage', 'MahaAuth', 'TENANT_FORBIDDEN', 'migrateDB', 'toast', 'saveDB', 'let DB=ctx.DB;' + engine + ';return {getDB:()=>DB,MahaSync,msReconcile};')(ctx, localStorage, MahaAuth, new Set(['pan', 'cvc', 'cvv', 'cardvault', 'session']), d => d, m => ctx.toasts.push(m), () => { });
  ctx.api = api; ctx.sync = api.MahaSync; return ctx;
}
const newHotel = () => ({ code: 'H1', set: { name: 'Hotel One', bd: '2026-10-09', nextRsv: 1201, nextInv: 101, nextInternal: 3100, nextSys: 5200, nextProfile: 300 },
  rooms: [{ no: '101', type: 'STD' }], guests: [{ id: 'g1', last: 'Ann' }],
  reservations: [{ id: 'r1', no: 1200, guest: 'g1', status: 'res', remark: '', bookings: [{ id: 'b1', room: '101', lines: [{ id: 'l1', amt: 100, desc: 'Room' }, { id: 'l2', amt: 50, desc: 'Minibar' }] }] }],
  users: [], logs: [], invoices: [], amend: [], audits: [] });

(async () => {
  /* the helper itself */
  const D0 = device(makeServer()); const R = D0.api.msReconcile;
  const t = { id: 'x', lines: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], note: 'old', gone: 1 }, la = t.lines[0], lb = t.lines[1];
  R(t, { id: 'x', lines: [{ id: 'b', n: 22 }, { id: 'a', n: 1 }, { id: 'c', n: 3 }], note: 'new' });
  T('reconcile keeps the same objects (found by id) and brings in the new values', t.lines[0] === lb && t.lines[1] === la && lb.n === 22 && t.lines.length === 3 && t.lines[2].id === 'c' && t.note === 'new' && !('gone' in t));

  /* two devices, a window open on device A holds the live booking */
  const S = makeServer(); const A = device(S), B = device(S);
  A.api.getDB().hotels.H1 = newHotel(); A.sync.reset('H1', 'pid'); await A.sync.firstCopy();
  B.api.getDB().hotels = {}; const r = await B.sync.open('H1', 'pid'); B.api.getDB().hotels.H1 = {}; B.sync.install(r);
  const hA = A.api.getDB().hotels.H1, held = hA.reservations[0].bookings[0], heldLine = held.lines[0];
  let remote = 0; A.sync.onRemote = n => { remote += n };

  /* device B edits the same reservation (a remark) and a guest */
  const hB = B.api.getDB().hotels.H1; hB.reservations[0].remark = 'VIP'; hB.guests[0].last = 'Anne';
  await B.sync.syncOnce(); await A.sync.syncOnce();
  T('the change from the other device arrives', hA.reservations[0].remark === 'VIP' && hA.guests[0].last === 'Anne');
  T('the booking the window holds is STILL the live booking of the hotel', hA.reservations[0].bookings[0] === held && held.lines[0] === heldLine);
  T('A was told once that something arrived', remote >= 1);

  /* the window posts a line into the held booking: it is in the hotel and goes to the cloud */
  held.lines.push({ id: 'l3', amt: 25, desc: 'Posted in the open window' });
  await A.sync.syncOnce(); await B.sync.syncOnce();
  T('what the open window posted is saved and reaches the other device', B.api.getDB().hotels.H1.reservations[0].bookings[0].lines.some(l => l.id === 'l3'));

  /* A's own save comes back from the server: nothing to apply, nothing to announce */
  remote = 0;
  A.api.getDB().hotels.H1.guests[0].last = 'Anna';
  await A.sync.syncOnce(); await A.sync.syncOnce();
  T('A\'s own save does not trigger "Updated from another device"', remote === 0, String(remote));

  /* the screen */
  T('the notice while a window is open is limited, and the screen refreshes when the windows close', /_remoteToastAt>30000/.test(src) && /if\(!MODALS\.length&&_remotePending\)/.test(src));
  T('Reports open on top of the page (no second tab that can stay blank)', /function openReportsTab\(\)\{[^]*?openReportsOverlay\(\)\}/.test(src) && !/window\.open\(location\.href\.split\('#'\)\[0\]\+'#reports'/.test(src));
  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
