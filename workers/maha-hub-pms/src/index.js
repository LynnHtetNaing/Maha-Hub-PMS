/** Maha Hub Worker - serves the static Hub through the Assets binding.
 *
 *  Every system has its own address, and nothing is redirected:
 *    MAIN_HOST     (solutions.maha-hub.com)  the Main page where a person chooses a system
 *    PMS_HOST      (pms.maha-hub.com)        Maha PMS
 *    SALES_HOST    (sales.maha-hub.com)      Maha Sales
 *    CONNECT_HOST / REACH_HOST / BOOK_HOST   the other systems, when they are released
 *    CONSOLE_HOST  (console.maha-hub.com)    the Provider console
 *  On each of these addresses "/" opens that system. Any other address (the website, a test copy, workers.dev) keeps the
 *  old paths: /solutions is the Main page, /solutions-PMS is the PMS, /ecosystem/Reach|Connect|Booking|Sales the others.
 */
/* the folder address: asking the assets for /ecosystem/index.html answers with a redirect to /ecosystem/ */
const APP_FILE = '/ecosystem/';
const SYSTEM_DOC = {
  pms: { file: APP_FILE },
  reach: { file: '/reach/index.html', base: '/reach/' },
  connect: { file: '/connect/index.html', base: '/connect/' },
  booking: { file: '/book/index.html', base: '/book/' },
  sales: { file: '/sales/index.html', base: '/sales/' },
};
/* which environment setting names which address, and what "/" opens there */
const HOST_VARS = [
  ['MAIN_HOST', { doc: { file: APP_FILE } }],
  ['PMS_HOST', { doc: { file: APP_FILE } }],
  ['CONSOLE_HOST', { doc: { file: APP_FILE } }],
  ['SALES_HOST', { doc: SYSTEM_DOC.sales }],
  ['CONNECT_HOST', { doc: SYSTEM_DOC.connect }],
  ['REACH_HOST', { doc: SYSTEM_DOC.reach }],
  ['BOOK_HOST', { doc: SYSTEM_DOC.booking }],
];

function cleanPath(pathname) {
  return pathname.replace(/\/index\.html?$/i, '').replace(/\.html?$/i, '').replace(/\/+$/, '') || '/';
}

/* what to serve for a path on the old paths, or where to send the visitor */
function route(pathname) {
  const path = cleanPath(pathname);
  const low = path.toLowerCase();
  if (low === '/solutions') return { doc: { file: APP_FILE } };
  let m = low.match(/^\/solutions-(pms|reach|connect|booking|sales)$/);
  if (m) return { doc: SYSTEM_DOC[m[1]] };
  if (low === '/ecosystem') return { to: '/solutions' };
  m = low.match(/^\/ecosystem\/(pms)$/);
  if (m) return { to: '/solutions-PMS' };
  m = low.match(/^\/ecosystem\/(reach|connect|booking|sales)$/);
  if (m) return { doc: SYSTEM_DOC[m[1]] };
  return null;
}

/* which system this address belongs to, or null */
function hostDoc(host, env) {
  for (const [name, entry] of HOST_VARS) {
    const v = String(env[name] || '').toLowerCase();
    if (v && v === host) return entry;
  }
  return null;
}

async function serveDoc(doc, request) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = doc.file;
  const res = await request.env.ASSETS.fetch(new Request(assetUrl, request));
  if (!doc.base) return res;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;
  let html = await res.text();
  if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${doc.base}">`);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response('Maha Hub Worker OK', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const bare = url.pathname.replace(/\/+$/, '') || '/';
    const low = cleanPath(url.pathname).toLowerCase();
    request.env = env;

    /* a system's own address: "/" opens the system, no redirect; the files it needs load as usual */
    const own = hostDoc(host, env);
    if (own) {
      if (bare === '/' || bare.toLowerCase() === '/index.html') return serveDoc(own.doc, request);
      /* the old paths are not served on a system address */
      if (low === '/solutions' || /^\/solutions-/.test(low) || /^\/ecosystem(\/|$)/.test(low)) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return env.ASSETS.fetch(request);
    }

    /* any other address (website, test copy): the old paths */
    const r = route(url.pathname);
    if (!r) return env.ASSETS.fetch(request);
    if (r.to) {
      const dest = new URL(r.to, url);
      dest.search = url.search;
      dest.hash = url.hash;
      return Response.redirect(dest, 302);
    }
    return serveDoc(r.doc, request);
  },
};
