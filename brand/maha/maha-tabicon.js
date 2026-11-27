/* Maha browser-tab icon while a page is loading.
   During a reload or refresh the normal tab icon goes away and only the loading circle shows: small dots rolling round, swelling and shrinking
   one after another, the same as the dots in the loading screens of the systems. As the page is about to land (the page has loaded and the Maha
   loading screen starts to fade) the normal icon comes back. It also runs whenever the small "loading" box (MahaLoader mini) is on the screen. */
(function () {
  'use strict';
  if (window.MahaTabIcon) return;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var S = 64, N = 8, PERIOD = 1200, COLOR = '#14b88a', RADIUS = 21, DOT = 5.2;
  var cv = document.createElement('canvas'); cv.width = cv.height = S;
  var cx = cv.getContext('2d'); if (!cx) return;
  var timer = 0, running = false, t0 = Date.now();

  function iconLinks() { return Array.prototype.slice.call(document.querySelectorAll('link[rel~="icon"]')); }
  function busy() {
    var big = document.getElementById('mahaLoader');
    if (big && !/\bml-out\b/.test(big.className)) return true;   /* the loading screen fades out: the page is landing, the icon is back */
    if (document.getElementById('mahaMini')) return true;
    return document.readyState !== 'complete' && !big;
  }
  function grow(p) {   /* the same swell as the loading dots: small, big, medium, small */
    if (p < 0.35) return 0.3 + 0.95 * (p / 0.35);
    if (p < 0.7) return 1.25 - 0.8 * ((p - 0.35) / 0.35);
    return 0.45 - 0.15 * ((p - 0.7) / 0.3);
  }
  function frame() {
    cx.clearRect(0, 0, S, S);
    var t = (Date.now() - t0) % PERIOD;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2 - Math.PI / 2, p = ((t / PERIOD) - i / N + 1) % 1, k = grow(p);
      cx.globalAlpha = Math.min(1, 0.25 + 0.75 * ((k - 0.3) / 0.95));
      cx.fillStyle = COLOR; cx.beginPath();
      cx.arc(S / 2 + Math.cos(a) * RADIUS, S / 2 + Math.sin(a) * RADIUS, DOT * k, 0, Math.PI * 2); cx.fill();
    }
    cx.globalAlpha = 1;
    var url; try { url = cv.toDataURL('image/png'); } catch (e) { return; }
    iconLinks().forEach(function (l) {
      if (!l.dataset.mahaOrig) l.dataset.mahaOrig = l.getAttribute('href') || '';
      l.setAttribute('href', url);
    });
  }
  function restore() {
    iconLinks().forEach(function (l) { if (l.dataset.mahaOrig) { l.setAttribute('href', l.dataset.mahaOrig); delete l.dataset.mahaOrig; } });
  }
  function tick() {
    if (busy()) { if (!running) { running = true; t0 = Date.now(); } frame(); return; }
    if (running) { running = false; restore(); }
  }
  timer = setInterval(tick, 90);
  tick();
  window.MahaTabIcon = { stop: function () { clearInterval(timer); running = false; restore(); } };
})();
