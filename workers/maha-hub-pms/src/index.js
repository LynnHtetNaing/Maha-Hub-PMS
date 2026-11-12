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

/* an address that is kept for a system that does not exist yet: a friendly 404 page (an explorer trying to plug two cables), never the website, never another system */
async function notPluggedIn(request, env) {
  const u = new URL(request.url);
  let res = await env.ASSETS.fetch(new Request(new URL('/errors/unplugged', u), { method: 'GET' }));
  const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : '';
  if (loc) res = await env.ASSETS.fetch(new Request(new URL(loc, u), { method: 'GET' }));
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  return new Response(request.method === 'HEAD' ? null : res.body, { status: 404, headers });
}

/* a quotation or MSA a hotel opens from the CRM email: crm.maha-hub.com/d/<token>. The token is long and random; the document is read from the database by that token only. */
async function sharedDoc(env, token) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, ''), key = env.SUPABASE_ANON_KEY || '';
  const gone = () => new Response('This link is not available any more. Please ask Maha Hub to send it again.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (!base || !key) return gone();
  try {
    const r = await fetch(base + '/rest/v1/rpc/maha_shared_doc', { method: 'POST', headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ p_token: token }) });
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || !rows[0] || !rows[0].html) return gone();
    return new Response(rows[0].html, { headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'",
    } });
  } catch { return gone(); }
}

/* a hotel's answer to an Enewletter: crm.maha-hub.com/r/<token>. The page asks the hotel to confirm (so a mail scanner that opens the link does not answer for the hotel);
   the Supabase function crm-reply checks the signed token and records the answer. The page holds no secret. */
function replyPage(env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const script = String.raw`(function () {
  var T = location.pathname.split('/').pop(), U = __URL__, B = document.getElementById('b');
  function say(h) { B.innerHTML = h; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fail(el) { el.disabled = false; document.getElementById('e').textContent = 'It could not be saved. Please try again.'; }
  fetch(U + '?t=' + encodeURIComponent(T)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok) { say('<h2>This link is not valid</h2><p>Please ask Maha Hub to send it again.</p>'); return; }
    if (d.done) { say('<h2>Thank you</h2><p>We already have your answer.</p>'); return; }
    say('<h2>' + esc(d.label) + '</h2><p>' + esc(d.title || '') + '</p><textarea id="n" maxlength="500" placeholder="A message for us (optional)"></textarea><button id="g">Confirm</button><p class="e" id="e"></p>');
    document.getElementById('g').onclick = function () {
      var g = this; g.disabled = true;
      fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: T, note: document.getElementById('n').value }) })
        .then(function (r) { return r.json(); })
        .then(function (x) { if (x && x.ok) say('<h2>Thank you</h2><p>We received your answer. We will be in touch.</p>'); else fail(g); })
        .catch(function () { fail(g); });
    };
  }).catch(function () { say('<h2>Please try again</h2><p>The page could not load.</p>'); });
})();`.replace('__URL__', JSON.stringify(base + '/functions/v1/crm-reply'));
  const css = 'body{margin:0;background:#eef1f3;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a272f;display:grid;min-height:100vh;place-items:center;padding:16px}'
    + '.c{background:#fff;border:1px solid #c5d0d8;border-radius:14px;max-width:440px;width:100%;overflow:hidden}.h{background:#0A3020;color:#fff;padding:14px 20px;font-weight:700}'
    + '.b{padding:20px}h2{margin:0 0 6px;font-size:20px}p{margin:6px 0;color:#556470}textarea{width:100%;box-sizing:border-box;min-height:70px;border:1px solid #c5d0d8;border-radius:8px;padding:8px;font:inherit;margin:10px 0}'
    + 'button{background:#D49A38;color:#1a272f;font:700 16px system-ui,sans-serif;border:0;border-radius:8px;padding:11px 20px;cursor:pointer}button[disabled]{opacity:.6}.e{color:#B4432F}';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Maha Hub</title><style>' + css + '</style></head>'
    + '<body><div class="c"><div class="h">Maha Hub</div><div class="b" id="b"><p>Loading...</p></div></div><script>' + script + '</scr' + 'ipt></body></html>';
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src " + (base || "'none'") + "; base-uri 'none'; form-action 'none'",
  } });
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

    /* the CRM email link to one document */
    { const m = /^\/d\/([A-Za-z0-9_-]{24,64})$/.exec(bare); if (m && host === String(env.CRM_HOST || '').toLowerCase()) return sharedDoc(env, m[1]); }

    /* a hotel's answer to an Enewletter */
    { const m = /^\/r\/[A-Za-z0-9_.-]{40,900}$/.exec(bare); if (m && host === String(env.CRM_HOST || '').toLowerCase()) return replyPage(env); }

    /* a system's own address: "/" opens the system, no redirect; the files it needs load as usual */
    const own = hostDoc(host, env);
    if (own) {
      if (own.reserved) return notPluggedIn(request, env);
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
