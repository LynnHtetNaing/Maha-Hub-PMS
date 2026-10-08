/* Maha Hub — small, dependency-free site script */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Mobile menu */
  var head = document.querySelector('.site-head');
  var menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = head.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
  }

  /* Integrated workflow: the gold line follows the reader down the flow */
  var flow = document.querySelector('.flow');
  if (flow) {
    var steps = flow.querySelectorAll('.step');
    var update = function () {
      var r = flow.getBoundingClientRect();
      var mark = window.innerHeight * 0.6;
      var p = reduce ? 1 : Math.min(1, Math.max(0, (mark - r.top) / r.height));
      flow.style.setProperty('--prog', p);
      steps.forEach(function (s) {
        var sr = s.getBoundingClientRect();
        s.classList.toggle('lit', reduce || sr.top + sr.height / 2 < mark);
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* Contact form: validates, then opens the visitor's email app with the message ready to send */
  var form = document.getElementById('contact-form');
  if (form) {
    var params = new URLSearchParams(location.search);
    var product = params.get('product');
    if (product) {
      var sel = form.querySelector('#f-interest');
      if (sel) { [].forEach.call(sel.options, function (o) { if (o.value === product) sel.value = product; }); }
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      form.querySelectorAll('[required]').forEach(function (el) {
        var f = el.closest('.field');
        var bad = !el.value.trim() || (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
        f.classList.toggle('bad', bad);
        if (bad && ok) { el.focus(); ok = false; }
      });
      if (!ok) return;
      var v = function (id) { var el = form.querySelector(id); return el ? el.value.trim() : ''; };
      var body = [
        'Name: ' + v('#f-name'),
        'Business / hotel: ' + v('#f-business'),
        'Email: ' + v('#f-email'),
        'Phone: ' + (v('#f-phone') || '-'),
        'Country: ' + v('#f-country'),
        'Interested in: ' + (v('#f-interest') || '-'),
        '',
        v('#f-message')
      ].join('\n');
      var subject = 'Website enquiry: ' + v('#f-business');
      window.location.href = 'mailto:' + form.dataset.to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      form.querySelector('.form-done').classList.add('show');
    });
    form.querySelectorAll('input,textarea,select').forEach(function (el) {
      el.addEventListener('input', function () { el.closest('.field').classList.remove('bad'); });
    });
  }

  /* Live hero: the photo follows the visitor's local time of day */
  var hero = document.querySelector('.hero-live');
  if (hero) {
    var stars = hero.querySelector('.hl-stars'), flies = hero.querySelector('.hl-flies');
    for (var i = 0; i < 70; i++) {
      var st = document.createElement('i');
      st.style.left = (Math.random() * 100) + '%'; st.style.top = (Math.random() * 100) + '%';
      st.style.animationDelay = (-Math.random() * 3) + 's';
      if (Math.random() < .15) { st.style.width = st.style.height = '3px'; }
      stars.appendChild(st);
    }
    for (var k = 0; k < 14; k++) {
      var f = document.createElement('i');
      f.style.left = (Math.random() * 90) + '%'; f.style.top = (Math.random() * 90) + '%';
      f.style.animationDelay = (-Math.random() * 9) + 's'; f.style.animationDuration = (7 + Math.random() * 6) + 's';
      flies.appendChild(f);
    }
    var forced = new URLSearchParams(location.search).get('time');   // preview: ?time=day|dawn|dusk|night
    var names = { dawn: 'Sunrise view', day: 'Daylight view', dusk: 'Sunset view', night: 'Night view' };
    var setTime = function () {
      var now = new Date(), h = now.getHours();
      var ph = forced && names[forced] ? forced : (h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night');
      document.documentElement.setAttribute('data-time', ph);
      var tm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById('hl-time-text').textContent = forced && names[forced] ? names[ph] + ' (preview)' : names[ph] + ', ' + tm + ' your time';
    };
    /* water copy uses the same photo */
    var heroImg = hero.querySelector('.hl-stage img'), wimg = hero.querySelector('.a-waterimg');
    var simg = hero.querySelector('.a-skyimg');
    var setWater = function () { if (!heroImg.currentSrc) return; if (wimg) wimg.setAttribute('href', heroImg.currentSrc); if (simg) simg.setAttribute('href', heroImg.currentSrc); };
    if (heroImg.complete) setWater(); else heroImg.addEventListener('load', setWater);
    /* stars reflected in the lake */
    var sref = hero.querySelector('.a-starref');
    if (sref) {
      var ns = 'http://www.w3.org/2000/svg';
      for (var r = 0; r < 40; r++) {
        var c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', 170 + Math.random() * 860); c.setAttribute('cy', 690 + Math.random() * 240);
        c.setAttribute('r', (0.8 + Math.random() * 1.2).toFixed(1));
        c.style.animationDelay = (-Math.random() * 3) + 's'; c.style.opacity = (.35 + Math.random() * .4).toFixed(2);
        sref.appendChild(c);
      }
    }
    /* the sun follows the visitor's real time: rises on the right at 6:00, highest at noon, sets on the left at 18:00 */
    var sun = hero.querySelector('.a-sun'), cover = hero.querySelector('.a-suncover');
    var placeSun = function () {
      var now = new Date(), h = now.getHours() + now.getMinutes() / 60;
      var f = forced ? { dawn: 6.3, day: 9.5, dusk: 17.6, night: 0 }[forced] : h;
      var t = Math.min(1, Math.max(0, (f - 6) / 12));
      var x = 1285 - t * (1285 - 360), y = 493 - Math.sin(Math.PI * t) * 400;
      if (sun) sun.setAttribute('transform', 'translate(' + x.toFixed(0) + ' ' + y.toFixed(0) + ')');
      if (cover) cover.style.opacity = t < 0.03 ? 0 : 1;
    };
    setTime(); placeSun(); setInterval(function () { setTime(); placeSun(); }, 30000);
    /* lighter scene on phones and low-power devices: keep the motion, skip the heavy water/sky filters */
    var lite = matchMedia('(max-width:760px)').matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.connection && navigator.connection.saveData);
    if (lite) { hero.querySelectorAll('[filter="url(#wflow)"],[filter="url(#skyflow)"]').forEach(function (g) { g.removeAttribute('filter'); }); hero.classList.add('lite'); }
    document.addEventListener('visibilitychange', function () { hero.classList.toggle('paused', document.hidden); });
    /* pause the live scene when it is off screen */
    if ('IntersectionObserver' in window) {
      var svgArt = hero.querySelector('.hl-art');
      new IntersectionObserver(function (es) {
        var vis = es[0].isIntersecting;
        hero.classList.toggle('paused', !vis);
        if (svgArt && svgArt.pauseAnimations) { vis ? svgArt.unpauseAnimations() : svgArt.pauseAnimations(); }
      }).observe(hero);
    }
    requestAnimationFrame(function () { setTimeout(function () { document.body.classList.add('loaded'); }, 60); });
  }

  /* Gentle scroll reveal */
  var rv = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else { rv.forEach(function (el) { el.classList.add('in'); }); }

  /* =========== Page-change curtain (traditional gold and lacquer, modern motion) =========== */
  var NAMES = { 'index': 'Home', 'products': 'Products', 'solutions': 'Solutions', 'about': 'About Maha', 'pricing': 'Pricing',
    'security': 'Security', 'contact': 'Contact', 'privacy': 'Privacy Policy', 'terms': 'Terms of Service', 'refund': 'Refund Policy' };
  var MARK = 'https://maha-hub.com/icons/maha-mark-sq.png';
  var ORN = '<svg class="orn" viewBox="0 0 240 28" aria-hidden="true"><path d="M2 14h70M168 14h70" stroke="currentColor" stroke-width="1"/><path d="M72 14c9 0 13-9 22-9 7 0 9 7 3 9-5 2-8-3-4-5M168 14c-9 0-13-9-22-9-7 0-9 7-3 9 5 2 8-3 4-5M80 14c8 0 12 7 20 7 5 0 6-4 2-5M160 14c-8 0-12 7-20 7-5 0-6-4-2-5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M120 2c7 6 9 11 0 23-9-12-7-17 0-23z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="108" cy="14" r="1.6" fill="none" stroke="currentColor"/><circle cx="132" cy="14" r="1.6" fill="none" stroke="currentColor"/></svg>';
  /* Calm page change: the old page fades up and away, a fine gold thread runs under the menu, the new page rises in */
  var thread = document.createElement('div'); thread.className = 'thread'; thread.setAttribute('aria-hidden', 'true');
  document.body.appendChild(thread);
  var runThread = function () { thread.classList.remove('run'); void thread.offsetWidth; thread.classList.add('run'); };
  var MahaPT = {
    cover: function (title, done) {
      if (reduce) { done && done(); return; }
      runThread();
      var cur = document.querySelector('.pv-page:not([hidden])') || document.querySelector('main');
      if (cur) cur.classList.add('leaving');
      setTimeout(function () { if (cur) cur.classList.remove('leaving'); done && done(); }, 320);
    },
    reveal: function () {},
    enter: function (scope) {
      var el = scope || document.querySelector('main');
      if (!el) return;
      el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    }
  };
  window.MahaPT = MahaPT;

  /* Multi-page site: play the curtain between real pages */
  if (!window.__MAHA_ONEFILE) {
    try {
      if (sessionStorage.getItem('mh-pt')) {
        sessionStorage.removeItem('mh-pt');
        var m0 = document.querySelector('main'); if (m0) m0.classList.add('arrive');
        MahaPT.enter(); runThread();
      }
    } catch (e) {}
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\.html$/.test(url.pathname)) return;
      if (url.pathname === location.pathname) return;          // same page: just scroll
      e.preventDefault();
      var key = url.pathname.split('/').pop().replace('.html', '');
      try { sessionStorage.setItem('mh-pt', '1'); } catch (er) {}
      MahaPT.cover(NAMES[key] || a.textContent.trim(), function () { location.href = url.href; });
    });
  }

  /* Gold ripple wherever you click */
  document.addEventListener('pointerdown', function (e) {
    var t = e.target.closest('.btn,.prod,.plan,.p-nav a,.dev-list a,.nav a,.sol,.trust,.panel,.pms-feature,.scale div,.toc a,.signin,.card2,.soon2,.eco-card a,.sol2-icons a');
    if (!t || reduce) return;
    var r = t.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    var rp = document.createElement('span'); rp.className = 'ripple';
    rp.style.width = rp.style.height = s + 'px';
    rp.style.left = (e.clientX - r.left) + 'px'; rp.style.top = (e.clientY - r.top) + 'px';
    t.appendChild(rp); setTimeout(function () { rp.remove(); }, 800);
  });

  /* Gold glint follows the pointer across product cards */
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest('.prod.live,.pms-feature'); if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  /* Sliding gold underline in the menu */
  var nav = document.querySelector('.nav');
  if (nav) {
    var ink = document.createElement('span'); ink.className = 'nav-ink'; nav.appendChild(ink);
    var moveInk = function (a) {
      if (!a) { ink.style.opacity = 0; return; }
      ink.style.opacity = 1; ink.style.left = a.offsetLeft + 10 + 'px'; ink.style.width = (a.offsetWidth - 20) + 'px';
    };
    var current = function () { return nav.querySelector('a[aria-current="page"]'); };
    nav.addEventListener('mouseover', function (e) { var a = e.target.closest('a'); if (a) moveInk(a); });
    nav.addEventListener('mouseleave', function () { moveInk(current()); });
    window.MahaInk = function () { moveInk(current()); };
    window.addEventListener('resize', window.MahaInk);
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(window.MahaInk);
    window.MahaInk();
  }

  /* Home: header turns solid ivory once you scroll past the top */
  var headEl = document.querySelector('.site-head');
  if (headEl && document.body.classList.contains('is-home')) {
    var solid = function () { headEl.classList.toggle('solid', window.scrollY > 40); };
    window.addEventListener('scroll', solid, { passive: true }); solid();
  }

  /* Current year in the footer */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
