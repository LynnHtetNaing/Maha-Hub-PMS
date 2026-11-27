/* Maha browser-tab icon while a page is loading.
   From the very first moment of a reload or refresh (this file is the first thing in <head>) the tab shows only the loading circle: small dots rolling
   round, one smooth wave swelling and shrinking them, like the dots in the loading screens of the systems. It stays for at least MIN_MS, so the circle is
   always seen as one calm animation. When the page has loaded and the Maha loading screen starts to fade, the circle melts into the normal Maha icon,
   just before the real page shows. It also runs whenever the small "loading" box (MahaLoader mini) is on the screen.
   Smoothness: the animation is 90 pictures per turn, each drawn only once and then kept, so a busy page (which is when a page loads) only has to swap the
   picture. The picture shown always follows the clock, so if the page is busy for a moment the circle jumps ahead to where it should be instead of slowing
   down. It is paced by the screen refresh (requestAnimationFrame), not by a timer, and the picture is changed only when it is a new one. */
(function () {
  'use strict';
  if (window.MahaTabIcon) return;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var head = document.head || document.getElementsByTagName('head')[0]; if (!head) return;
  var S = 64, N = 10, FRAMES = 90, PERIOD = 1600, COLOR = '#14b88a', RADIUS = 21.5, DOT = 5.4, MIN_MS = 1500, FADE_MS = 360, HOLD_MS = 350;
  var DEFAULT_ICON = '/icons/maha-mark-sq.png', ICON_V = 'v=2';
  var raf = window.requestAnimationFrame ? function (f) { return window.requestAnimationFrame(f); } : function (f) { return setTimeout(f, 16); };
  var cv = document.createElement('canvas'); cv.width = cv.height = S;
  var cx = cv.getContext('2d'); if (!cx) return;
  var START = Date.now(), t0 = START, orig = DEFAULT_ICON, tile = null, tileSrc = '', running = true, endAt = 0, shown = '', n = 0, cache = [];
  /* Chrome keeps one saved icon per page address in its history (the address-bar list shows it). The real icon is always put back under a new version
     mark, so Chrome has to fetch it again and replace any saved frame of the loading circle. */
  var real = function () { return orig + (orig.indexOf('?') < 0 ? '?' : '&') + ICON_V; };

  /* one icon link of our own, made at once; the page's own icon links are taken over (their address is kept for the end) */
  var link = document.createElement('link'); link.rel = 'icon'; link.type = 'image/png'; link.id = 'mahaTabIcon'; head.appendChild(link);
  /* The Maha logo is the FIRST icon the browser sees for the page (Chrome saves the icon it sees first in its history and address-bar list, so that
     saved picture is always the logo, never a frame of the circle). The circle starts a moment later and the logo is put back at the end. */
  shown = real(); link.setAttribute('href', shown);
  function adopt() {
    var all = document.querySelectorAll('link[rel~="icon"]');
    for (var i = 0; i < all.length; i++) { var l = all[i]; if (l === link) continue; var h = l.getAttribute('href'); if (h && h.indexOf('data:') !== 0) orig = h; if (l.parentNode) l.parentNode.removeChild(l); }
  }
  function loadTile() {
    if (orig === tileSrc) return; tileSrc = orig; tile = null;
    var src = orig, im = new Image(); im.onload = function () { if (tileSrc === src) tile = im; }; im.src = src;
  }
  function setHref(u) { if (u !== shown) { shown = u; link.setAttribute('href', u); } }
  function busy() {
    var big = document.getElementById('mahaLoader');
    if (big && !/\bml-out\b/.test(big.className)) return true;   /* the loading screen fades out: the page is landing */
    if (document.getElementById('mahaMini')) return true;
    if (Date.now() - START < MIN_MS) return true;
    return document.readyState !== 'complete' && !big;
  }
  function paint(phase, fade) {   /* phase 0..1 round the ring; fade 0 = only the circle ... 1 = only the Maha icon */
    cx.clearRect(0, 0, S, S);
    if (fade > 0 && tile) { cx.globalAlpha = fade; cx.drawImage(tile, 0, 0, S, S); }
    for (var i = 0; i < N; i++) {
      /* one smooth wave runs round the ring: the dot under the wave is biggest */
      var d = (i / N) - phase, k = 0.28 + 0.97 * Math.pow((1 + Math.cos(d * Math.PI * 2)) / 2, 2), a = (i / N) * Math.PI * 2 - Math.PI / 2;
      cx.globalAlpha = (0.3 + 0.7 * ((k - 0.28) / 0.97)) * (1 - fade);
      if (cx.globalAlpha <= 0.01) continue;
      cx.fillStyle = COLOR; cx.beginPath();
      cx.arc(S / 2 + Math.cos(a) * RADIUS, S / 2 + Math.sin(a) * RADIUS, DOT * k, 0, Math.PI * 2); cx.fill();
    }
    cx.globalAlpha = 1;
    try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function circleFrame(idx) { return cache[idx] || (cache[idx] = paint(idx / FRAMES, 0)); }   /* drawn once, then kept */
  function rest() { running = false; endAt = 0; setHref(real()); }   /* the normal Maha icon, no animation */
  /* A tab in the background is never left on a frozen frame of the circle (Chrome slows a hidden page, and the address bar and the tab list
     show whatever icon the page last set): the moment the tab is hidden, the Maha icon is put back. */
  document.addEventListener('visibilitychange', function () { adopt(); if (document.hidden) rest(); });
  window.addEventListener('pagehide', function () { adopt(); rest(); });
  function step() {
    if (++n % 8 === 1) { adopt(); loadTile(); }
    if (document.hidden) { if (running || endAt) rest(); return; }
    if (busy()) {
      if (Date.now() - START < HOLD_MS) return;   /* the logo is still showing, as the first icon */
      if (!running) { running = true; t0 = Date.now(); }
      endAt = 0;
      var u = circleFrame(Math.floor((((Date.now() - t0) % PERIOD) / PERIOD) * FRAMES) % FRAMES);
      if (u) setHref(u);
      return;
    }
    if (!running) return;
    if (!endAt) endAt = Date.now();
    var f = Math.min(1, (Date.now() - endAt) / FADE_MS);
    if (f >= 1 || !tile) { rest(); return; }   /* the circle has melted into the Maha icon */
    var e = f * f * (3 - 2 * f);                /* ease in and out */
    setHref(paint(((Date.now() - t0) % PERIOD) / PERIOD, e));
  }
  /* the screen refresh paces the animation; a slow timer also runs, because in the first moments of a page (before its first picture) the screen
     refresh may not come yet, and the circle must already be there */
  var dead = false, timer = setInterval(function () { if (!dead) step(); }, 50);
  (function loop() { if (dead) return; raf(loop); step(); })();
  window.MahaTabIcon = { stop: function () { dead = true; clearInterval(timer); running = false; setHref(real()); } };
})();
