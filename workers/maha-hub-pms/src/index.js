/** Maha Hub Worker - serves the static Hub through the Assets binding.
 *  /solutions is the Main page and sign-in. /solutions-PMS is the PMS. /ecosystem/Reach|Connect|Booking|Sales are the other systems.
 *  The old /ecosystem/ and /ecosystem/PMS addresses move to the new ones.
 */
const APP_FILE = '/ecosystem/index.html';
const SYSTEM_DOC = {
  pms: { file: APP_FILE },
  reach: { file: '/reach/index.html', base: '/reach/' },
  connect: { file: '/connect/index.html', base: '/connect/' },
  booking: { file: '/book/index.html', base: '/book/' },
  sales: { file: '/sales/index.html', base: '/sales/' },
};
const NAMES = { pms: 'PMS', reach: 'Reach', connect: 'Connect', booking: 'Booking', sales: 'Sales' };

function cleanPath(pathname) {
  return pathname.replace(/\/index\.html?$/i, '').replace(/\.html?$/i, '').replace(/\/+$/, '') || '/';
}

/* what to serve for a path, or where to send the visitor */
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

export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response('Maha Hub Worker OK', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const url = new URL(request.url);
    const bare = url.pathname.replace(/\/+$/, '') || '/';
    /* The PMS's own address (PMS_HOST, for example pms.maha-hub.com): the PMS opens at / and its old paths go to /.
       Other systems are not served on this address. Off (empty) until the address exists. */
    const pmsHost = String(env.PMS_HOST || '').toLowerCase();
    const host = url.hostname.toLowerCase();
    if (pmsHost && host === pmsHost) {
      const low = bare.toLowerCase();
      if (bare === '/' || low === '/index.html') {
        const a = new URL(request.url); a.pathname = APP_FILE;
        return env.ASSETS.fetch(new Request(a, request));
      }
      const rr = route(url.pathname);
      if (rr && rr.doc && rr.doc.base) {
        return Response.redirect('https://' + (env.MAIN_HOST || 'maha-hub.com') + url.pathname + url.search, 302);
      }
      if (rr) {
        const dest = new URL('/', url); dest.search = url.search; dest.hash = url.hash;
        return Response.redirect(dest, 302);
      }
      return env.ASSETS.fetch(request);
    }
    /* the main address: / is the website home page, served as a file */
    const r = route(url.pathname);
    if (!r) return env.ASSETS.fetch(request);
    /* switched on at launch: the old PMS paths on the main address send people to the PMS address */
    if (pmsHost && env.PMS_REDIRECT === '1' && r.doc === SYSTEM_DOC.pms && cleanPath(url.pathname).toLowerCase() !== '/solutions') {
      const dest = new URL('https://' + pmsHost + '/'); dest.search = url.search;
      return Response.redirect(dest, 302);
    }
    if (r.to) {
      const dest = new URL(r.to, url);
      dest.search = url.search;
      dest.hash = url.hash;
      return Response.redirect(dest, 302);
    }
    const doc = r.doc;
    const assetUrl = new URL(request.url);
    assetUrl.pathname = doc.file;
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (!doc.base) return res;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html')) return res;
    let html = await res.text();
    if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${doc.base}">`);
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(html, { status: res.status, statusText: res.statusText, headers });
  },
};