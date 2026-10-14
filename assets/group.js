/* Maha Hub Group of Companies - website behaviour. Small on purpose: menu, reveal-on-scroll, contact form. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* current year in the footer */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* mobile menu */
  var btn = $('.menu-btn'), nav = $('#nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); $$('.dd.open').forEach(function (d) { d.classList.remove('open'); }); }
    });
  }

  /* drop-down menus: click / tap (hover and keyboard focus work through CSS on wide screens) */
  $$('.dd > button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var dd = b.parentNode, open = !dd.classList.contains('open');
      $$('.dd.open').forEach(function (d) { d.classList.remove('open'); d.firstElementChild.setAttribute('aria-expanded', 'false'); });
      if (open) { dd.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
    });
  });
  document.addEventListener('click', function () { $$('.dd.open').forEach(function (d) { d.classList.remove('open'); d.firstElementChild.setAttribute('aria-expanded', 'false'); }); });

  /* reveal on scroll (content is simply visible when the browser cannot observe) */
  var items = $$('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else { items.forEach(function (el) { el.classList.add('in'); }); }

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
    /* ?interest=... in the address chooses the topic */
    try {
      var q = new URLSearchParams(location.search).get('interest');
      if (q && form.elements.interest) { Array.prototype.forEach.call(form.elements.interest.options, function (o) { if (o.value === q) form.elements.interest.value = q; }); }
    } catch (e) {}
  }
})();
