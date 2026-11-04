/** Maha Hub Worker - serves the static Hub through the Assets binding.
 *
 *  Every system has its own address, and nothing is redirected:
 *    MAIN_HOST     (solutions.maha-hub.com)  the Main page where a person chooses a system
 *    PMS_HOST      (pms.maha-hub.com)        Maha PMS
 *    CRM_HOST      (crm.maha-hub.com)        Maha Sales, Company: the Maha Hub team's own sales system, provider accounts only
 *    CONNECT_HOST / REACH_HOST / BOOK_HOST   the other systems, when they are released
 *    (the hotel Sales will get its own SALES_HOST when it exists; it never shares an address, a folder or a table with the company Sales)
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
  /* the folder address: asking the assets for /crm/index.html answers with a redirect to /crm/, so the folder itself is asked for */
  crm: { file: '/crm/', base: '/crm/' },
};
/* which environment setting names which address, and what "/" opens there */
const HOST_VARS = [
  ['MAIN_HOST', { doc: { file: APP_FILE } }],
  ['PMS_HOST', { doc: { file: APP_FILE } }],
  ['CONSOLE_HOST', { doc: { file: APP_FILE } }],
  ['CRM_HOST', { doc: SYSTEM_DOC.crm }],
  /* reserved for the hotel Sales: nothing is served there until that system exists */
  ['SALES_HOST', { reserved: true }],
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
  let m = low.match(/^\/solutions-(pms|reach|connect|booking)$/);
  if (m) return { doc: SYSTEM_DOC[m[1]] };
  if (low === '/ecosystem') return { to: '/solutions' };
  m = low.match(/^\/ecosystem\/(pms)$/);
  if (m) return { to: '/solutions-PMS' };
  m = low.match(/^\/ecosystem\/(reach|connect|booking|crm)$/);
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
      if (own.reserved) return new Response('This address is not available yet.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      if (bare === '/' || bare.toLowerCase() === '/index.html') return serveDoc(own.doc, request);
      /* a system's sign-in page: the same address, /signin (no redirect) */
      if (low === '/signin') return serveDoc({ file: APP_FILE }, request);
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
