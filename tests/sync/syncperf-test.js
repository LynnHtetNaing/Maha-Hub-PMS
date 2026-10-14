/* Keeping a big hotel in step with the cloud must be cheap when nothing changed (it ran every 12 seconds and after every save).
     node tests/sync/syncperf-test.js ecosystem/index.html */
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

const big = () => { const h = { code: 'H1', set: { name: 'Big Hotel', bd: '2026-10-09', nextRsv: 1201, nextInv: 101, nextInternal: 3100, nextSys: 5200, nextProfile: 300 }, rooms: [{ no: '101', type: 'STD' }], guests: [], reservations: [], users: [], logs: [], invoices: [], amend: [], audits: [] };
  for (let i = 0; i < 3000; i++) { h.guests.push({ id: 'g' + i, last: 'Guest ' + i, phone: '555' + i }); h.reservations.push({ id: 'r' + i, no: 1000 + i, guest: 'g' + i, status: 'res', remark: '', bookings: [{ id: 'b' + i, room: '101', lines: [0, 1, 2, 3, 4, 5].map(k => ({ id: 'l' + i + '_' + k, amt: 100 + k, desc: 'Line ' + k, bd: '2026-10-09' })) }] }) }
  return h; };
const time = async f => { const t = process.hrtime.bigint(); const r = await f(); return { ms: Number(process.hrtime.bigint() - t) / 1e6, r }; };

(async () => {
  const S = makeServer(); const A = device(S), B = device(S);
  const hA = big(); A.api.getDB().hotels.H1 = hA; A.api.getDB().savedAt = 1000; A.sync.reset('H1', 'pid');
  const first = await time(() => A.sync.firstCopy());
  T('the first copy of a big hotel goes up', first.r === true, first.ms.toFixed(0) + ' ms');
  B.api.getDB().hotels = {}; const o = await B.sync.open('H1', 'pid'); B.api.getDB().hotels.H1 = {}; B.sync.install(o);
  B.api.getDB().savedAt = 1000;
  const idle1 = await time(() => B.sync.syncOnce());
  const idle2 = await time(() => B.sync.syncOnce()), idle3 = await time(() => B.sync.syncOnce());
  const idle = Math.max(idle2.ms, idle3.ms);
  console.log('   first full check ' + idle1.ms.toFixed(0) + ' ms; idle rounds ' + idle2.ms.toFixed(1) + ' / ' + idle3.ms.toFixed(1) + ' ms');
  T('an idle round (nothing saved, nothing new) is far cheaper than the first full check', idle < idle1.ms / 4 || idle < 15, idle.toFixed(1) + ' ms vs ' + idle1.ms.toFixed(0));
  const rB = B.api.getDB().hotels.H1.reservations[5]; rB.remark = 'VIP'; B.api.getDB().savedAt = 2000;
  await B.sync.syncOnce(); await A.sync.syncOnce();
  T('an edit saved on one device reaches the other', hA.reservations[5].remark === 'VIP');
  hA.reservations[7].remark = 'Late'; A.api.getDB().savedAt = 3000;
  await A.sync.syncOnce(); await B.sync.syncOnce();
  T('and the other way', B.api.getDB().hotels.H1.reservations[7].remark === 'Late');
  B.api.getDB().hotels.H1.reservations[9].remark = 'Unsaved'; B.sync.fullAt = 0;
  await B.sync.syncOnce(); await A.sync.syncOnce();
  T('a change made without a save is still found by the safety check', hA.reservations[9].remark === 'Unsaved');
  T('the sync memory on the device is written only when something changed', /if\(remote\|\|sent\|\|this\.cursor!==cur0\|\|this\.persistDue\)/.test(src) && /nothing arrived: do not read the whole hotel/.test(src));
  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();