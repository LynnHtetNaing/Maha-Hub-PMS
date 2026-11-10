/* Maha loading screen: one file for the PMS, the Provider console, the CRM and Billing.
   MahaLoader.show({name:'Maha PMS', dark:false, msg:'Signing you in'})  -> the screen; returns a promise that resolves when the animation has finished
   MahaLoader.hide()                                                    -> waits for the animation to finish, then fades out; returns a promise
   First opening of a browser session (nothing shown yet in this tab): the lines of the logo and of the name are drawn in together from the base, both sides, up to the top (about 2.6 s).
   Every other loading: the logo pops up, slides to the left and the name is typed fast (about 1.2 s). The rolling dots start only after the logo and the name are shown.
   Light: sky, dark green logo and name. Dark: night, gold logo, ivory name. The sun (moon) stays above the logo and never moves; only the logo and the name move.
   MahaLoader.pageOpen() is called when a page is opened: a cloud request that starts in the next 1.5 s and lasts more than half a second shows the small dots (MahaLoader.config({dark:fn}) sets Light or Dark).
   With reduced motion the finished picture is shown at once. If the picture cannot load, the name and the dots still show. */
(function () {
  'use strict';
  if (window.MahaLoader) return;
  var LOGO = '/brand/maha/gate-gold.png', SCENE = {light: '/brand/maha/scene-light-nosun.svg', dark: '/brand/maha/scene-dark-nosun.svg'};
  var LW = 400, LH = 382, FS = 92, SPARK = '#f1c75a', GAP = 26, BUILD = 2600, TYPE_MS = 55, TYPE_START = 700, SEEN = 'maha.loader.seen';
  var PRESET = {
    light: {g: ['#2E8B67', '#1B6B50', '#0B3D2E'], txt: '#0B3D2E', ring: '#0B3D2E', cap: '#3d5a50'},
    dark: {g: ['#E3BC5E', '#C8A24A', '#9A7428'], txt: '#F1E5C9', ring: '#E3BC5E', cap: '#9fc4b4'}
  };
  var CSS = '#mahaLoader{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;font-family:Inter,"Noto Sans",system-ui,sans-serif;opacity:1;transition:opacity .35s;background:linear-gradient(180deg,#bfe8d8 0%,#d3efe3 50%,#e2f5ed 100%)}'
    + '#mahaLoader.ml-dark{background:linear-gradient(180deg,#08140f 0%,#0e2a21 55%,#15402f 100%)}'
    + '#mahaLoader.ml-out{opacity:0;pointer-events:none}'
    + '#mahaLoader .ml-scene{position:absolute;inset:0;background-position:50% 100%;background-size:100% auto;background-repeat:no-repeat;opacity:.7;pointer-events:none}'
    + '#mahaLoader.ml-dark .ml-scene{opacity:1}'
    + '#mahaLoader .ml-core{position:relative;display:flex;flex-direction:column;align-items:center;gap:34px;padding-top:30px;transform-origin:50% 50%}'
    + '#mahaLoader .ml-lockbox{position:relative}'
    + '#mahaLoader .ml-sun{position:absolute;left:4%;bottom:calc(100% + 44px);width:74px;height:74px;border-radius:50%;background:radial-gradient(circle at 40% 38%,#fffbe6,#fff0b8 60%,#ffe38a);box-shadow:0 0 90px 34px rgba(255,236,170,.85);pointer-events:none}'
    + '#mahaLoader.ml-dark .ml-sun{background:radial-gradient(circle at 40% 38%,#fffdf0,#f4efd2 65%,#e6dcae);box-shadow:0 0 70px 26px rgba(244,239,210,.30)}'
    + '#mahaLoader .ml-lockup{position:relative;display:flex;align-items:center;gap:26px;will-change:transform}'
    + '#mahaLoader .ml-logo{position:relative;width:200px;height:191px;flex:none}'
    + '#mahaLoader .ml-logo canvas,#mahaLoader .ml-logo img{position:absolute;left:0;top:0;width:100%;height:100%}'
    + '#mahaLoader .ml-word{position:relative;height:64px;min-width:10px}'
    + '#mahaLoader .ml-word canvas{position:absolute;left:0;top:0;height:100%}'
    + '#mahaLoader .ml-word span{position:relative;display:block;font-weight:800;font-size:46px;line-height:64px;letter-spacing:.02em;white-space:nowrap}'
    + '.ml-ring{position:relative;width:70px;height:70px;opacity:0;transition:opacity .4s}'
    + '.ml-ring.ml-on{opacity:1}'
    + '.ml-ring i{position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;transform:scale(.3);opacity:.35;animation:mlRoll 1.2s ease-in-out infinite}'
    + '@keyframes mlRoll{0%,100%{transform:scale(.3);opacity:.3}35%{transform:scale(1.25);opacity:1}70%{transform:scale(.45);opacity:.5}}'
    + '#mahaLoader .ml-msg{margin-top:-14px;min-height:18px;font-size:13.5px;font-weight:600;letter-spacing:.02em;opacity:0;transition:opacity .4s;text-align:center}'
    + '#mahaLoader .ml-msg.ml-on{opacity:.85}'
    + '#mahaMini{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147482000;display:flex;flex-direction:column;align-items:center;gap:0;padding:14px 22px 12px;border-radius:16px;background:rgba(255,255,255,.93);color:#3d5a50;box-shadow:0 10px 30px rgba(8,40,30,.22);pointer-events:none;transition:opacity .25s;font-family:Inter,"Noto Sans",system-ui,sans-serif;font-size:13px;font-weight:600}'
    + '#mahaMini.ml-dark{background:rgba(14,42,33,.93);color:#cfe3d9}'
    + '#mahaMini .ml-ring{transform:scale(.8);margin:-8px 0}'
    + '@media (prefers-reduced-motion:reduce){.ml-ring i{animation:none;opacity:.8;transform:scale(.8)}}';
  var img = null, imgP = null, cache = {}, cur = null;

  function css() { if (document.getElementById('mahaLoaderCss')) return; var s = document.createElement('style'); s.id = 'mahaLoaderCss'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  function loadImg() {
    if (imgP) return imgP;
    imgP = new Promise(function (res, rej) { var i = new Image(); i.onload = function () { img = i; res(i); }; i.onerror = function () { rej(new Error('logo')); }; i.src = LOGO; });
    return imgP;
  }
  var keyOf = function (x, y, W, H) { return (1 - y / H) * 0.78 + (1 - Math.abs(x - W / 2) / (W / 2)) * 0.22; };   /* the base on both sides first, the spire last */
  function prep(data, W, H) { var key = new Float32Array(W * H); for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) key[y * W + x] = keyOf(x, y, W, H); return {data: data, W: W, H: H, key: key, out: new ImageData(W, H)}; }
  function prepare(mode, name) {
    var k = mode + '|' + name; if (cache[k]) return cache[k];
    var P = PRESET[mode];
    cache[k] = loadImg().then(function (im) {
      var o = document.createElement('canvas'); o.width = LW; o.height = LH; var c = o.getContext('2d'); c.drawImage(im, 0, 0, LW, LH); c.globalCompositeOperation = 'source-in';
      var gr = c.createLinearGradient(0, 0, 0, LH); gr.addColorStop(0, P.g[0]); gr.addColorStop(0.55, P.g[1]); gr.addColorStop(1, P.g[2]); c.fillStyle = gr; c.fillRect(0, 0, LW, LH);
      var logo = prep(c.getImageData(0, 0, LW, LH).data, LW, LH), tint = o.toDataURL('image/png');
      var font = '800 ' + FS + 'px Inter, "Noto Sans", system-ui, sans-serif';
      var load = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('800 ' + FS + 'px Inter'), new Promise(function (r) { setTimeout(r, 700); })]).catch(function () {}) : Promise.resolve();
      return load.then(function () {
        var m = document.createElement('canvas').getContext('2d'); m.font = font; var tw = Math.ceil(m.measureText(name).width) + 10, th = Math.round(FS * 1.4);
        var t = document.createElement('canvas'); t.width = tw; t.height = th; var tc = t.getContext('2d'); tc.font = font; tc.textBaseline = 'middle'; tc.fillStyle = P.txt; tc.fillText(name, 2, th / 2 + 3);
        return {logo: logo, tint: tint, text: prep(tc.getImageData(0, 0, tw, th).data, tw, th), tw: tw, th: th};
      });
    });
    cache[k].catch(function () { delete cache[k]; });
    return cache[k];
  }
  /* the lines of the logo and of the name are drawn in from the base, both sides, up to the top, with a soft gold glow at the edge */
  function reveal(c2, P, thr, sparks) {
    var data = P.data, W = P.W, H = P.H, key = P.key, o = P.out.data, FE = 0.1, n = W * H, i, j, a, f, g;
    for (i = 0; i < n; i++) {
      j = i * 4; a = data[j + 3]; if (!a) { o[j + 3] = 0; continue; }
      f = (thr - key[i]) / FE; if (f <= 0) { o[j + 3] = 0; continue; } if (f > 1) f = 1; g = f < 1 ? 1 - f : 0;
      o[j] = data[j] + (241 - data[j]) * g; o[j + 1] = data[j + 1] + (199 - data[j + 1]) * g; o[j + 2] = data[j + 2] + (90 - data[j + 2]) * g; o[j + 3] = a * Math.min(1, f * 1.4);
    }
    c2.putImageData(P.out, 0, 0);
    for (var s = 0; s < sparks; s++) {
      var x = Math.random() * W, y = Math.random() * H, q = Math.floor(y) * W + Math.floor(x), ff = (thr - key[q]) / FE;
      if (ff > 0 && ff < 1 && data[q * 4 + 3] > 80) { var r = (W > 500 ? 8 : 6) * (1 - ff) + 2; c2.globalAlpha = 0.9; c2.strokeStyle = SPARK; c2.lineWidth = 1.6; c2.beginPath(); c2.moveTo(x - r, y); c2.lineTo(x + r, y); c2.moveTo(x, y - r); c2.lineTo(x, y + r); c2.stroke(); c2.globalAlpha = 1; }
    }
  }
  function reduced() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  function build(o) {
    var mode = o.dark ? 'dark' : 'light', P = PRESET[mode], name = String(o.name || 'Maha'), first = true;
    try { first = !sessionStorage.getItem(SEEN); sessionStorage.setItem(SEEN, '1'); } catch (e) {}
    css();
    var el = document.createElement('div'); el.id = 'mahaLoader'; el.className = mode === 'dark' ? 'ml-dark' : ''; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-label', 'Loading');
    el.innerHTML = '<div class="ml-scene"></div><div class="ml-core"><div class="ml-lockbox"><div class="ml-sun"></div><div class="ml-lockup"><div class="ml-logo"><canvas width="' + LW + '" height="' + LH + '"></canvas><img alt=""></div><div class="ml-word"><canvas></canvas><span></span></div></div></div><div class="ml-ring"></div><div class="ml-msg"></div></div>';
    document.body.appendChild(el);
    var q = function (s) { return el.querySelector(s); };
    var scene = q('.ml-scene'), core = q('.ml-core'), lock = q('.ml-lockup'), logoC = q('.ml-logo canvas'), logoI = q('.ml-logo img'), wordC = q('.ml-word canvas'), word = q('.ml-word'), span = q('.ml-word span'), ring = q('.ml-ring'), msg = q('.ml-msg');
    scene.style.backgroundImage = 'url(' + SCENE[mode] + ')';
    span.style.color = P.txt; msg.style.color = P.cap; span.textContent = name;
    for (var i = 0; i < 12; i++) { var d = document.createElement('i'), a = i / 12 * Math.PI * 2 - Math.PI / 2; d.style.left = (35 + Math.cos(a) * 29) + 'px'; d.style.top = (35 + Math.sin(a) * 29) + 'px'; d.style.animationDelay = (i * 0.1) + 's'; d.style.background = P.ring; ring.appendChild(d); }
    var st = {el: el, raf: 0, timers: [], hiding: false, resolveReady: null, name: name};
    st.ready = new Promise(function (r) { st.resolveReady = r; });
    st.setMsg = function (m) { msg.textContent = m || ''; };
    st.setMsg(o.msg);
    var after = function (ms, fn) { st.timers.push(setTimeout(fn, ms)); };
    var finish = function () { ring.classList.add('ml-on'); msg.classList.add('ml-on'); st.resolveReady(true); };
    var fit = function (tw) { var need = 200 + GAP + tw / 2, k = Math.min(1, (window.innerWidth - 32) / need); if (k < 1) core.style.transform = 'scale(' + k.toFixed(3) + ')'; };
    prepare(mode, name).then(function (R) {
      if (st.dead) return;
      fit(R.tw); wordC.width = R.tw; wordC.height = R.th; wordC.style.width = (R.tw / 2) + 'px'; word.style.width = (R.tw / 2) + 'px'; logoI.src = R.tint;
      var lc = logoC.getContext('2d'), wc = wordC.getContext('2d');
      if (reduced()) { logoC.style.display = 'none'; wordC.style.display = 'none'; after(400, finish); return; }
      if (first) {   /* 1 - first opening: drawn in from the base */
        span.style.display = 'none'; logoI.style.display = 'none';
        var t0 = performance.now(), tw = []; for (var s = 0; s < 30; s++) tw.push({x: Math.random() * LW, y: Math.random() * LH, p: Math.random() * 6});
        var step = function (now) {
          if (st.dead) return; var p = Math.min(1, (now - t0) / BUILD), thr = p * 1.2 - 0.08;
          reveal(lc, R.logo, thr, p < 1 ? 4 : 0); reveal(wc, R.text, thr, p < 1 ? 3 : 0);
          if (p >= 1) { for (var k = 0; k < tw.length; k++) { var qd = tw[k], sv = (Math.sin(now / 380 + qd.p) + 1) / 2; if (sv > 0.9) { var ix = Math.floor(qd.y) * LW + Math.floor(qd.x); if (R.logo.data[ix * 4 + 3] > 80) { lc.globalAlpha = (sv - 0.9) * 10; lc.strokeStyle = SPARK; lc.lineWidth = 1.6; lc.beginPath(); lc.moveTo(qd.x - 6, qd.y); lc.lineTo(qd.x + 6, qd.y); lc.moveTo(qd.x, qd.y - 6); lc.lineTo(qd.x, qd.y + 6); lc.stroke(); lc.globalAlpha = 1; } } } }
          st.raf = requestAnimationFrame(step);
        };
        st.raf = requestAnimationFrame(step); after(BUILD + 250, finish);
      } else {   /* 2 - every other loading: the logo pops up, slides to the left, the name is typed fast */
        logoC.style.display = 'none'; wordC.style.display = 'none'; span.textContent = '';
        var off = (R.tw / 2 + GAP) / 2; logoI.style.opacity = 0; logoI.style.transform = 'scale(.55)'; lock.style.transform = 'translateX(' + off + 'px)';
        void lock.offsetWidth;
        after(60, function () { logoI.style.transition = 'transform .34s cubic-bezier(.2,1.5,.4,1),opacity .2s'; logoI.style.opacity = 1; logoI.style.transform = 'scale(1)'; });
        after(480, function () { lock.style.transition = 'transform .42s cubic-bezier(.25,.8,.25,1)'; lock.style.transform = 'translateX(0)'; });
        for (var c = 0; c < name.length; c++) (function (n) { after(TYPE_START + n * TYPE_MS, function () { span.textContent = name.slice(0, n + 1); }); })(c);
        after(TYPE_START + name.length * TYPE_MS + 250, finish);
      }
    }).catch(function () {   /* the picture could not load: the name and the dots still show */
      logoC.style.display = 'none'; logoI.style.display = 'none'; wordC.style.display = 'none'; word.style.width = 'auto'; after(300, finish);
    });
    after(45000, function () { api.hide(); });   /* never stays on the screen for ever */
    return st;
  }
  function kill(st) { st.dead = true; cancelAnimationFrame(st.raf); st.timers.forEach(clearTimeout); if (st.el.parentNode) st.el.parentNode.removeChild(st.el); }
  var api = {
    show: function (o) {
      o = o || {};
      if (cur && cur.hiding) { kill(cur); cur = null; }
      if (cur) { if (o.msg !== undefined) cur.setMsg(o.msg); return cur.ready; }
      cur = build(o); return cur.ready;
    },
    hide: function () {
      var st = cur; if (!st) return Promise.resolve();
      if (st.hiding) return st.gone || Promise.resolve();
      st.hiding = true;
      st.gone = st.ready.then(function () { return new Promise(function (res) { st.el.classList.add('ml-out'); setTimeout(function () { kill(st); if (cur === st) cur = null; res(); }, 380); }); });
      return st.gone;
    },
    isShowing: function () { return !!cur && !cur.hiding; }
  };
  /* The small dots: a page that waits for the cloud (a request that starts in the 1.5 s after a page is opened) shows a small ring in the middle of the content, only if the wait lasts more than half a second.
     No logo and no full screen; the menu stays usable. It goes away when the last request is done. The full loading screen above it hides it. */
  var MINI = {n: 0, open: 0, timer: 0, off: 0, el: null, dark: function () { return document.documentElement.getAttribute('data-mode') === 'dark'; }};
  function miniHide() { clearTimeout(MINI.off); if (MINI.el) { var e = MINI.el; MINI.el = null; e.style.opacity = 0; setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 260); } }
  function miniShow() {
    if (MINI.el || (cur && !cur.hiding) || !document.body) return;
    css(); var dark = false; try { dark = !!MINI.dark(); } catch (e) {}
    var el = document.createElement('div'); el.id = 'mahaMini'; el.className = dark ? 'ml-dark' : ''; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Loading');
    var ring = document.createElement('div'); ring.className = 'ml-ring ml-on';
    for (var i = 0; i < 12; i++) { var d = document.createElement('i'), a = i / 12 * Math.PI * 2 - Math.PI / 2; d.style.left = (35 + Math.cos(a) * 29) + 'px'; d.style.top = (35 + Math.sin(a) * 29) + 'px'; d.style.animationDelay = (i * 0.1) + 's'; d.style.background = PRESET[dark ? 'dark' : 'light'].ring; ring.appendChild(d); }
    var cap = document.createElement('div'); cap.textContent = 'Loading...'; el.appendChild(ring); el.appendChild(cap); document.body.appendChild(el); MINI.el = el; MINI.off = setTimeout(miniHide, 20000);
  }
  function watchFetch() {
    if (window.__mlFetch || !window.fetch) return; window.__mlFetch = true; var of = window.fetch;
    window.fetch = function (input, init) {
      var url = '', method = 'GET'; try { url = typeof input === 'string' ? input : (input && input.url) || ''; method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); } catch (e) {}
      var track = Date.now() < MINI.open && url.indexOf('.supabase.co/') > -1 && url.indexOf('/realtime') < 0 && (method === 'GET' || url.indexOf('/rpc/') > -1);
      if (!track) return of.apply(this, arguments);
      MINI.n++; if (MINI.n === 1) { clearTimeout(MINI.timer); MINI.timer = setTimeout(miniShow, 500); }
      var done = function () { MINI.n = Math.max(0, MINI.n - 1); if (MINI.n === 0) { clearTimeout(MINI.timer); setTimeout(function () { if (MINI.n === 0) miniHide(); }, 150); } };
      var p = of.apply(this, arguments); p.then(done, done); return p;
    };
  }
  api.pageOpen = function () { MINI.open = Date.now() + 1500; };
  api.config = function (o) { if (o && typeof o.dark === 'function') MINI.dark = o.dark; };
  api.miniShowing = function () { return !!MINI.el; };
  watchFetch();
  window.MahaLoader = api;
  try { loadImg().catch(function () {}); } catch (e) {}   /* the logo is fetched early */
})();
