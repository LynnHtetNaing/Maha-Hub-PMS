/* Maha Hub Group of Companies - website behaviour: menu, live motion (reveal, tilt, screens that change, counters), the booking window, contact form.
   The page works without this file; it only adds movement. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* mobile menu and drop-downs */
  var btn = $('.menu-btn'), nav = $('#nav');
  if (btn && nav) btn.addEventListener('click', function () { var o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  var closeDd = function () { $$('.dd.open').forEach(function (d) { d.classList.remove('open'); d.firstElementChild.setAttribute('aria-expanded', 'false'); }); };
  $$('.dd > button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation(); var dd = b.parentNode, open = !dd.classList.contains('open'); closeDd();
      if (open) { dd.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
    });
  });
  document.addEventListener('click', closeDd);

  /* the booking window: every [data-book="demo|talk"] button opens the Maha booking page (crm.maha-hub.com) in a window */
  var ov = null, fr = null, lastFocus = null;
  var HOST = 'https://crm.maha-hub.com/book/';
  var shut = function () { if (!ov) return; ov.classList.remove('on'); fr.src = 'about:blank'; document.body.style.overflow = ''; if (lastFocus) try { lastFocus.focus(); } catch (e) {} };
  var openBook = function (kind) {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Book a time with Maha Hub');
      ov.innerHTML = '<div class="mod"><button class="x" type="button" aria-label="Close">&times;</button><iframe title="Book a time" src="about:blank" allow="clipboard-write"></iframe></div>';
      document.body.appendChild(ov); fr = $('iframe', ov);
      $('.x', ov).addEventListener('click', shut);
      ov.addEventListener('click', function (e) { if (e.target === ov) shut(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { shut(); if (nav) { nav.classList.remove('open'); } closeDd(); } });
    }
    lastFocus = document.activeElement; fr.src = HOST + (kind === 'talk' ? 'talk' : 'demo'); ov.classList.add('on'); document.body.style.overflow = 'hidden'; $('.x', ov).focus();
  };
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-book]'); if (!t) return; e.preventDefault(); if (nav) nav.classList.remove('open'); openBook(t.getAttribute('data-book'));
  });
  if (/[?&]book=(demo|talk)\b/.test(location.search)) openBook(/book=talk/.test(location.search) ? 'talk' : 'demo');

  /* reveal on scroll, one after the other inside a group */
  var items = $$('.reveal');
  items.forEach(function (el, i) { var p = el.parentNode, k = Array.prototype.indexOf.call(p.children, el); el.style.setProperty('--i', Math.min(k, 6)); });
  if ('IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else items.forEach(function (el) { el.classList.add('in'); });

  /* the two brand boxes: a tap (or Enter) makes one the big one; tap it again to let go */
  $$('.brands').forEach(function (g) {
    var cards = $$('.brand-card', g);
    cards.forEach(function (c) {
      c.setAttribute('tabindex', '0');
      var pick = function (e) {
        if (e.target.closest && e.target.closest('a,button')) return;
        var was = c.classList.contains('sel');
        cards.forEach(function (x) { x.classList.remove('sel'); }); g.classList.remove('has-sel');
        if (!was) { c.classList.add('sel'); g.classList.add('has-sel'); }
      };
      c.addEventListener('click', pick); c.addEventListener('keydown', function (e) { if (e.key === 'Enter') pick(e); });
    });
  });

  /* header shadow once the page is scrolled */
  var head = $('.site-head');
  var onScroll = function () { if (head) head.classList.toggle('stuck', (window.scrollY || 0) > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* screens that change by themselves (.cyc holds the pictures; tabs can drive them) */
  var cycles = [];
  $$('.cyc').forEach(function (c) {
    var imgs = $$('img', c), cap = $('.cap', c), at = 0, timer = null, tabs = c.closest('.show') ? $$('.tab', c.closest('.show')) : null;
    if (!imgs.length) return;
    var show = function (n) {
      at = (n + imgs.length) % imgs.length;
      imgs.forEach(function (im, i) { im.classList.toggle('on', i === at); });
      if (cap) cap.textContent = imgs[at].getAttribute('data-cap') || '';
      if (tabs) tabs.forEach(function (t, i) { t.classList.remove('on'); if (i === at) { void t.offsetWidth; t.classList.add('on'); t.setAttribute('aria-selected', 'true'); } else t.setAttribute('aria-selected', 'false'); });
    };
    var play = function () { if (calm || timer) return; timer = setInterval(function () { show(at + 1); }, tabs ? 5000 : 3800); };
    var stop = function () { clearInterval(timer); timer = null; };
    show(0); play();
    if (tabs) {
      var sh = c.closest('.show');
      tabs.forEach(function (t, i) { t.addEventListener('click', function () { stop(); show(i); play(); }); });
      sh.addEventListener('mouseenter', function () { stop(); sh.classList.add('paused'); });
      sh.addEventListener('mouseleave', function () { sh.classList.remove('paused'); play(); });
    }
    /* pictures load only when the user gets near */
    cycles.push({ el: c, play: play, stop: stop });
  });
  if ('IntersectionObserver' in window) {
    var vis = new IntersectionObserver(function (es) { es.forEach(function (e) { var c = cycles.filter(function (x) { return x.el === e.target; })[0]; if (c) e.isIntersecting ? c.play() : c.stop(); }); }, { threshold: 0.2 });
    cycles.forEach(function (c) { vis.observe(c.el); });
  }

  /* the laptop leans a little toward the pointer */
  $$('.dev').forEach(function (d) {
    var lap = $('.laptop', d); if (!lap || calm || d.classList.contains('still')) return;
    d.addEventListener('mousemove', function (e) {
      var r = d.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      lap.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg'); lap.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg');
    });
    d.addEventListener('mouseleave', function () { lap.style.setProperty('--ry', '0deg'); lap.style.setProperty('--rx', '0deg'); });
  });

  /* numbers that count up when they come into view */
  var counters = $$('[data-count]');
  var run = function (el) {
    var to = parseInt(el.getAttribute('data-count'), 10) || 0, t0 = null;
    if (calm) { el.textContent = to; return; }
    var step = function (t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / 1300); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { run(e.target); co.unobserve(e.target); } }); }, { threshold: 0.6 });
    counters.forEach(function (c) { co.observe(c); });
  } else counters.forEach(function (c) { c.textContent = c.getAttribute('data-count'); });

  /* contact form: checks the answers, then opens the visitor's email app with the message ready to send */
  var form = $('#contact-form');
  if (form) {
    var TO = 'hello@maha-hub.com';
    var valid = function (f, name) {
      var el = f.elements[name]; if (!el) return true;
      var v = (el.value || '').trim(), ok = true;
      if (el.required && !v) ok = false;
      if (name === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ok = false;
      el.closest('.field').classList.toggle('bad', !ok);
      return ok;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var all = ['name', 'business', 'email', 'country', 'message'].map(function (n) { return valid(form, n); });
      if (all.indexOf(false) >= 0) { var bad = $('.field.bad input, .field.bad textarea', form); if (bad) bad.focus(); return; }
      var g = function (n) { return (form.elements[n].value || '').trim(); };
      var subject = 'Enquiry from ' + g('name') + (g('interest') ? ' - ' + g('interest') : '');
      var body = 'Name: ' + g('name') + '\nBusiness / hotel: ' + g('business') + '\nEmail: ' + g('email') +
        '\nPhone: ' + (g('phone') || '-') + '\nCountry: ' + g('country') + '\nInterested in: ' + (g('interest') || '-') + '\n\n' + g('message');
      window.location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      var done = $('.form-done', form); if (done) done.classList.add('show');
    });
    $$('input,select,textarea', form).forEach(function (el) { el.addEventListener('blur', function () { if (el.name) valid(form, el.name); }); });
    try {
      var q = new URLSearchParams(location.search).get('interest');
      if (q && form.elements.interest) { Array.prototype.forEach.call(form.elements.interest.options, function (o) { if (o.value === q) form.elements.interest.value = q; }); }
    } catch (e) {}
  }
})();
