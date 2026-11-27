/* Maha browser-tab icon while a page is loading.
   From the very first moment of a reload or refresh (this file is the first thing in <head>) the tab shows only the loading circle: small dots rolling
   round, smoothly swelling and shrinking one after another, like the dots in the loading screens of the systems. It stays for at least MIN_MS, so the
   circle is always seen as one calm animation. When the page has loaded and the Maha loading screen starts to fade, the circle melts into the normal
   Maha icon, just before the real page shows. It also runs whenever the small "loading" box (MahaLoader mini) is on the screen. */
(function () {
  'use strict';
  if (window.MahaTabIcon) return;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var head = document.head || document.getElementsByTagName('head')[0]; if (!head) return;
  var S = 64, N = 8, PERIOD = 1500, COLOR = '#14b88a', RADIUS = 21, DOT = 6.2, MIN_MS = 1500, FADE_MS = 320, TICK = 40;
  var DEFAULT_ICON = '/icons/maha-mark-sq.png';
  var cv = document.createElement('canvas'); cv.width = cv.height = S;
  var cx = cv.getContext('2d'); if (!cx) return;
  var START = Date.now(), t0 = START, orig = DEFAULT_ICON, tile = null, tileSrc = '', running = true, endAt = 0, timer = 0;

  /* one icon link of our own, made at once; the page's own icon links are taken over (their address is kept for the end) */
  var link = document.createElement('link'); link.rel = 'icon'; link.type = 'image/png'; link.id = 'mahaTabIcon'; head.appendChild(link);
  function adopt() {
    var all = document.querySelectorAll('link[rel~="icon"]');
    for (var i = 0; i < all.length; i++) { var l = all[i]; if (l === link) continue; var h = l.getAttribute('href'); if (h && h.indexOf('data:') !== 0) orig = h; if (l.parentNode) l.parentNode.removeChild(l); }
  }
  function loadTile() {
    if (orig === tileSrc) return; tileSrc = orig; tile = null;
    var src = orig, im = new Image(); im.onload = function () { if (tileSrc === src) tile = im; }; im.src = src;
  }
  function busy() {
    var big = document.getElementById('mahaLoader');
    if (big && !/\bml-out\b/.test(big.className)) return true;   /* the loading screen fades out: the page is landing */
    if (document.getElementById('mahaMini')) return true;
    if (Date.now() - START < MIN_MS) return true;
    return document.readyState !== 'complete' && !big;
  }
  function draw(fade) {   /* fade 0 = only the circle ... 1 = only the Maha icon */
    cx.clearRect(0, 0, S, S);
    if (fade > 0 && tile) { cx.globalAlpha = fade; cx.drawImage(tile, 0, 0, S, S); }
    var t = (Date.now() - t0) % PERIOD;
    for (var i = 0; i < N; i++) {
      /* one smooth wave runs round the ring: the dot under the wave is biggest */
      var d = (i / N) - (t / PERIOD), k = 0.3 + 0.95 * Math.pow((1 + Math.cos(d * Math.PI * 2)) / 2, 2.2), a = (i / N) * Math.PI * 2 - Math.PI / 2;
      cx.globalAlpha = (0.3 + 0.7 * ((k - 0.3) / 0.95)) * (1 - fade);
      if (cx.globalAlpha <= 0.01) continue;
      cx.fillStyle = COLOR; cx.beginPath();
      cx.arc(S / 2 + Math.cos(a) * RADIUS, S / 2 + Math.sin(a) * RADIUS, DOT * k, 0, Math.PI * 2); cx.fill();
    }
    cx.globalAlpha = 1;
    try { link.setAttribute('href', cv.toDataURL('image/png')); } catch (e) {}
  }
  function tick() {
    adopt(); loadTile();
    if (busy()) { if (!running) { running = true; t0 = Date.now(); } endAt = 0; draw(0); return; }
    if (!running) return;
    if (!endAt) endAt = Date.now();
    var f = Math.min(1, (Date.now() - endAt) / FADE_MS);
    if (f >= 1 || !tile) { running = false; endAt = 0; link.setAttribute('href', orig); return; }   /* the circle has melted into the Maha icon */
    draw(f);
  }
  timer = setInterval(tick, TICK);
  tick();
  window.MahaTabIcon = { stop: function () { clearInterval(timer); running = false; link.setAttribute('href', orig); } };
})();
