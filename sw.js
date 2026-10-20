/* Maha Hub PMS â€” offline shell. Hotel data stays in IndexedDB / localStorage, not in this cache. */
const CACHE='mahahub-mh5-62';
const ASSETS=['/ecosystem/index.html','/manifest.json','/brand/pms/icon-32.png','/brand/pms/icon-48.png','/brand/pms/icon-192.png','/brand/pms/icon-180.png','/brand/pms/icon-512.png','/brand/pms/mark-256.png','/brand/pms/lockup.png','/brand/login-hero-bg.jpg','/brand/ecosystem-hero.jpg'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;
  /* Never cache guest EDC links â€” always network (avoids stale "Link not found"). */
  if(/\/edc-link(\/|$)/i.test(url.pathname)){
    e.respondWith(fetch(req).catch(()=>new Response('EDC link offline',{status:503,headers:{'Content-Type':'text/plain'}})));
    return;
  }
  /* Maha Sales has its own shell. Do not cache it here or fall back to the PMS page. */
  if(/\/(?:sales|ecosystem\/sales)(\/|$)/i.test(url.pathname)) return;
  e.respondWith(fetch(req).then(res=>{
    if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{})}
    return res;
  }).catch(()=>caches.match(req).then(hit=>hit||caches.match('/ecosystem/index.html'))));
});
