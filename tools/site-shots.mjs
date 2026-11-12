/* Takes the real screens of the Maha systems (PMS with its demo hotel, CRM with demo records) for the website.
     node tools/site-shots.mjs pms|crm|all [outDir]
   It serves the project on a local port, opens each screen in a hidden browser at laptop size, and saves WebP files into assets/site/ (or outDir).
   The demo data is the built-in demo of the PMS and invented records for the CRM: no real hotel, guest or customer appears. */
import { launch } from './cdp.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const what = process.argv[2] || 'all', out = path.resolve(root, process.argv[3] || 'assets/site');
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('no'); return; }
    /* the PMS is opened in its built-in demo mode (no cloud sign-in), only for these screens */
    if (/[\\/]ecosystem[\\/]index\.html$/.test(f)) d = Buffer.from(String(d).replace('enabled:true,', 'enabled:false,'));
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream';
    r.writeHead(200, { 'content-type': t + '; charset=utf-8' }); r.end(d); });
}).listen(8790);
const BASE = 'http://localhost:8790';
const b = await launch();
const W = 1440, H = 900;
const set = (sel, v) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;

async function pms() {
  await b.size(W, H, 1.5);
  await b.go(BASE + '/ecosystem/index.html'); await b.sleep(4500);
  await b.eval(`document.querySelector('#lgCards [data-sys="hub"]').click()`); await b.sleep(1500);
  await b.eval(set('#lgUser', 'manager')); await b.eval(set('#lgPass', 'manager123')); await b.eval(set('#lgCash', '0'));
  await b.eval(`document.querySelector('#lgGo').click()`); await b.sleep(4500);
  await b.eval(`(()=>{const x=[...document.querySelectorAll('button')].find(e=>/Frontend/.test(e.textContent));if(x)x.click()})()`); await b.sleep(3500);   /* the area box: Frontend */
  /* the Modern look, with sample names only (no real hotel or guest name) */
  console.log(await b.eval(`(()=>{H.set.skin='modern';H.name=H.set.name='Sample Hotel';H.legal='Sample Hotel Co., Ltd.';H.addr='Sample address';(H.guests||[]).forEach((g,i)=>{g.last='Sample '+String.fromCharCode(65+(i%26));g.first='Guest';g.middle='';});try{saveDB&&saveDB()}catch(e){};applySkin();renderShell();return 'skin '+document.documentElement.getAttribute('data-skin')})()`)); await b.sleep(1500);
  const views = [['fo.dash', 'pms-dashboard'], ['fo.status', 'pms-status'], ['fo.grid', 'pms-grid'], ['fo.inhouse', 'pms-inhouse'], ['rm.hkstatus', 'pms-housekeeping'], ['rm.roomstatus', 'pms-roomstatus'], ['fo.arrivals', 'pms-arrivals'], ['res.list', 'pms-reservations']];
  for (const [v, name] of views) {
    try {
      await b.eval(`go(${JSON.stringify(v)})`); await b.sleep(2200);
      await b.eval(`document.querySelectorAll('.toast').forEach(t=>t.remove())`);
      await b.shot(path.join(out, name + '.webp')); console.log('shot', name);
    } catch (e) { console.log('skip', name, e.message); }
  }
}
/* CRM: invented records (no real hotel, person or customer), made through the page's own save() */
const SEED = `(async () => {
  const people = ['Sales A', 'Sales B', 'Sales C', 'Sales D'], ym = new Date().toISOString().slice(0, 7), day = n => ym + '-' + String(Math.min(28, Math.max(1, n))).padStart(2, '0');
  const rnd = (a, s) => a[(s * 7 + 3) % a.length];
  people.forEach((n, i) => save({id: 'sc' + i, kind: 'staffcr', name: n, dept: 'Sales', pct: 25, status: 'Active'}));
  const names = Array.from({length: 16}, (_, i) => 'Sample Hotel ' + String(i + 1).padStart(2, '0'));
  const cities = ['Phuket', 'Bangkok', 'Chiang Mai', 'Bagan', 'Vientiane', 'Hua Hin', 'Krabi', 'Yangon'], countries = ['Thailand', 'Thailand', 'Thailand', 'Myanmar', 'Laos', 'Thailand', 'Thailand', 'Myanmar'];
  const st = ['Signed', 'Live', 'Meeting set', 'Quoted', 'Negotiating', 'Follow up', 'Called', 'New Database', 'Signed', 'Meeting set', 'Quoted', 'Live', 'Follow up', 'Called', 'Negotiating', 'Signed'];
  for (let i = 0; i < names.length; i++) {
    const hid = 'h' + i, o = people[i % 4];
    await save({id: hid, kind: 'hotel', name: names[i], status: st[i], city: cities[i % 8], country: countries[i % 8], owner: o, managed: 'No', rooms: 40 + i * 9, email: 'info@' + names[i].toLowerCase().replace(/[^a-z]/g, '') + '.example', contact: 'Sample Contact', source: 'Website booking', created: day(i + 1) + 'T09:00:00Z'});
    for (let k = 0; k < 3; k++) await save({id: 'mc' + i + '_' + k, kind: 'act', hotelId: hid, type: 'Meeting', meeting: true, meetType: 'Online', meetStatus: 'Completed', date: day(1 + ((i * 3 + k * 5) % 12)), time: '11:00', contactName: 'Sample Contact', owner: people[(i + k) % 4 === 3 && i % 3 ? 0 : (i + k) % 3], done: true});
    if (i % 2 === 0) await save({id: 'm' + i, kind: 'act', hotelId: hid, type: 'Meeting', meeting: true, meetType: i % 4 ? 'Online' : 'Onsite', meetStatus: i < 10 ? 'Completed' : 'On Process', date: day(i + 2), time: '10:00', contactName: 'Sample Contact', owner: o, done: true});
    if (['Quoted', 'Negotiating', 'Signed', 'Live'].includes(st[i])) await save({id: 'q' + i, kind: 'quote', hotelId: hid, hotelName: names[i], no: 'QT-2026-' + String(100 + i), date: day(i + 3), status: st[i] === 'Quoted' || st[i] === 'Negotiating' ? 'Sent' : 'Accepted', owner: o, items: []});
    if (['Signed', 'Live'].includes(st[i])) await save({id: 'ms' + i, kind: 'msa', hotelId: hid, status: 'Signed', date: day(i + 4), owner: o});
  }
  return 'seeded';
})()`;
async function crmShots() {
  await b.size(W, H, 1.5);
  await b.go(BASE + '/crm/index.html#dashboard'); await b.sleep(3500);
  console.log(await b.eval(SEED)); await b.sleep(1200);
  await b.go(BASE + '/crm/index.html?seeded#dashboard'); await b.sleep(3500);   /* opened again, so every page reads the records */
  const views = [['dashboard', 'crm-dashboard'], ['hotels', 'crm-hotels'], ['meetings', 'crm-meetings'], ['quotes', 'crm-quotes'], ['enews', 'crm-enewletter']];
  for (const [v, name] of views) {
    try {
      await b.eval('location.hash=' + JSON.stringify('#' + v)); await b.sleep(2600);
      await b.eval("document.querySelectorAll('.toast').forEach(t=>t.remove())");
      await b.shot(path.join(out, name + '.webp')); console.log('shot', name);
    } catch (e) { console.log('skip', name, e.message); }
  }
}
/* the public booking page (live) */
async function bookShots() {
  await b.size(1440, 900, 1.5);
  await b.go('https://crm.maha-hub.com/book/demo'); await b.sleep(6500);
  await b.eval("document.querySelector('.slot')&&document.querySelector('.slot').scrollIntoView({block:'center'})"); await b.sleep(400);
  await b.shot(path.join(out, 'booking-demo.webp')); console.log('shot booking-demo');
}
try {
  if (what === 'book' || what === 'all') await bookShots();
  if (what === 'pms' || what === 'all') await pms();
  if (what === 'crm' || what === 'all') await crmShots();
} finally { b.close(); srv.close(); }
