/** Maha Hub Worker — serves the static Hub through the Assets binding.
 *  /ecosystem/ is the sign-in. /ecosystem/PMS|Reach|Connect|Booking are the systems that already exist.
 */
const SYSTEM_DOC = {
  pms: { file: '/ecosystem/index.html' },
  reach: { file: '/reach/index.html', base: '/reach/' },
  connect: { file: '/connect/index.html', base: '/connect/' },
  booking: { file: '/book/index.html', base: '/book/' },
};

function systemDoc(pathname) {
  const path = pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
  const m = path.match(/\/ecosystem\/(pms|reach|connect|booking)$/i);
  return m ? SYSTEM_DOC[m[1].toLowerCase()] : null;
}

export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response('Maha Hub Worker OK', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const url = new URL(request.url);
    const doc = systemDoc(url.pathname);
    if (!doc) return env.ASSETS.fetch(request);
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
