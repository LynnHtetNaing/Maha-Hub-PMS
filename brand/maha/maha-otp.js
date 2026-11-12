/* Maha Hub: the 6-digit code boxes for every code in every Maha system (Authenticator code, emailed device code, ...).
   MahaOtp.attach(input, { onComplete })   replaces a code text box by six single-digit boxes. The real input stays (hidden, same id) and always holds the digits, so the page
                                           code that reads input.value keeps working. onComplete(code) is called when the sixth digit is in (use it to send the form).
   Returns { win(), error(message), clear(), focus(), busy(on), value() }:
     win()   plays the success: the boxes do a wave and fireworks go off over the page (resolves after about a second, then close the pop-up)
     error() shakes the boxes red, clears them and shows the message
   Each digit pops in with a small golden sparkle. Someone who asked their computer to reduce motion only sees the colours change.
   The look is the Maha look: white boxes, forest green when filled, gold focus, fireworks in the Maha gold and green. */
(function () {
  'use strict';
  var STYLE_ID = 'mahaOtpStyle', REDUCE = false;
  try { REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
  var F = 'Inter,"Noto Sans","Noto Sans Thai","Noto Sans Myanmar",system-ui,sans-serif';
  var css = [
    '.mo-wrap{margin:14px 0 6px}',
    '.mo-row{display:flex;gap:9px;justify-content:center}',
    '.mo-row input{width:50px;height:60px;border:1.5px solid #c5d0d8;border-radius:14px;background:#fff;text-align:center;font:700 26px ' + F + ';color:#1f2d36;padding:0;margin:0;transition:border-color .15s,box-shadow .15s,background .15s;-webkit-appearance:none;appearance:none}',
    '.mo-row input:focus{outline:none;border-color:#D49A38;box-shadow:0 0 0 3px rgba(212,154,56,.25)}',
    '.mo-row input.mo-fill{border-color:#184D3A;background:#f1f7f3}',
    '.mo-row input.mo-pop{animation:moPop .42s cubic-bezier(.2,1.6,.4,1)}',
    '@keyframes moPop{0%{transform:scale(1)}30%{transform:scale(1.28) rotate(-5deg)}55%{transform:scale(.94) rotate(4deg)}78%{transform:scale(1.06) rotate(-2deg)}100%{transform:scale(1) rotate(0)}}',
    '.mo-row.mo-bad input{border-color:#B4432F;animation:moShake .5s}',
    '@keyframes moShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-7px)}35%{transform:translateX(6px)}55%{transform:translateX(-4px)}75%{transform:translateX(3px)}}',
    '.mo-row.mo-win input{border-color:#1F8A4C;background:#e6f5ec;animation:moWave .6s ease both}',
    '.mo-row.mo-win input:nth-child(2){animation-delay:.05s}.mo-row.mo-win input:nth-child(3){animation-delay:.1s}.mo-row.mo-win input:nth-child(4){animation-delay:.15s}.mo-row.mo-win input:nth-child(5){animation-delay:.2s}.mo-row.mo-win input:nth-child(6){animation-delay:.25s}',
    '@keyframes moWave{0%{transform:translateY(0)}35%{transform:translateY(-14px) scale(1.1)}70%{transform:translateY(2px)}100%{transform:translateY(0)}}',
    '.mo-row.mo-busy input{opacity:.7}',
    '.mo-msg{min-height:22px;margin:8px 0 0;text-align:center;font:600 14px ' + F + '}.mo-msg.mo-e{color:#B4432F}.mo-msg.mo-o{color:#1F8A4C}',
    '.mo-fx{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000}',
    '@media(max-width:420px){.mo-row{gap:6px}.mo-row input{width:42px;height:52px;font-size:22px}}',
  ].join('');
  var COL = ['#D49A38', '#F6DFA4', '#fbf3e0', '#184D3A', '#1F8A4C', '#ffffff'];
  var cv = null, ctx = null, parts = [], raf = 0;
  function canvas() {
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.className = 'mo-fx'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv); ctx = cv.getContext('2d');
    var fit = function () { var d = window.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; };
    fit(); window.addEventListener('resize', fit);
    return cv;
  }
  function burst(x, y, n, o) {
    canvas();
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = o.speed * (0.45 + Math.random() * 0.75);
      parts.push({ x: x, y: y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: o.g, life: o.life * (0.7 + Math.random() * 0.6), age: 0, c: o.c || COL[(Math.random() * COL.length) | 0], r: o.r * (0.6 + Math.random()) });
    }
    run();
  }
  function run() {
    if (raf) return;
    var last = performance.now();
    var tick = function (t) {
      var dt = Math.min(32, t - last) / 16.7; last = t;
      var d = window.devicePixelRatio || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter(function (p) { return p.age < p.life; });
      parts.forEach(function (p) {
        p.age += dt; p.vy += p.g * dt; p.vx *= 0.992; p.px = p.x; p.py = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - Math.pow(p.age / p.life, 1.6)); ctx.strokeStyle = p.c; ctx.fillStyle = p.c;
        ctx.lineWidth = p.r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(tick); else { raf = 0; ctx.clearRect(0, 0, cv.width, cv.height); }
    };
    raf = requestAnimationFrame(tick);
  }
  function centre(el) { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  function sparkle(el) { if (REDUCE) return; var c = centre(el); burst(c[0], c[1], 10, { speed: 3.4, g: 0.05, life: 26, r: 2.4 }); }
  function fireworks(row) {
    if (REDUCE) return;
    var r = row.getBoundingClientRect(), cx = r.left + r.width / 2, top = Math.max(60, r.top);
    [[-0.42, -70, 0], [0.38, -110, 240], [0, -150, 480]].forEach(function (s) {
      setTimeout(function () { burst(cx + s[0] * Math.max(r.width, 300), Math.max(50, top + s[1]), 54, { speed: 5.6, g: 0.075, life: 66, r: 2.6 }); }, s[2]);
    });
  }

  window.MahaOtp = {
    attach: function (input, opts) {
      opts = opts || {};
      if (!document.getElementById(STYLE_ID)) { var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css; document.head.appendChild(st); }
      var wrap = document.createElement('div'); wrap.className = 'mo-wrap';
      var row = document.createElement('div'); row.className = 'mo-row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', '6-digit code');
      var msg = document.createElement('div'); msg.className = 'mo-msg'; msg.setAttribute('role', 'alert');
      var boxes = [], i;
      for (i = 0; i < 6; i++) {
        var b = document.createElement('input'); b.type = 'text'; b.inputMode = 'numeric'; b.maxLength = 1; b.autocomplete = i === 0 ? 'one-time-code' : 'off'; b.setAttribute('aria-label', 'Digit ' + (i + 1)); b.disabled = !!input.disabled;
        row.appendChild(b); boxes.push(b);
      }
      wrap.appendChild(row); wrap.appendChild(msg);
      /* the real input stays, hidden, and always holds the digits */
      input.parentNode.insertBefore(wrap, input); input.type = 'hidden'; input.removeAttribute('autofocus');
      var setVal = function () { var s = ''; boxes.forEach(function (x) { s += x.value; }); input.value = s; input.dispatchEvent(new Event('input', { bubbles: true })); return s; };
      var full = function () { return boxes.every(function (x) { return x.value; }); };
      var fillClass = function (x) { x.classList.toggle('mo-fill', !!x.value); };
      var popBox = function (x) { x.classList.remove('mo-pop'); void x.offsetWidth; x.classList.add('mo-pop'); sparkle(x); };
      var api = {
        value: function () { return input.value; },
        focus: function () { var k = 0; while (k < 5 && boxes[k].value) k++; try { boxes[k].focus(); } catch (e) { } },
        clear: function () { boxes.forEach(function (x) { x.value = ''; x.classList.remove('mo-fill', 'mo-pop'); }); row.classList.remove('mo-bad', 'mo-win'); msg.textContent = ''; msg.className = 'mo-msg'; input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); api.focus(); },
        busy: function (on) { row.classList.toggle('mo-busy', !!on); boxes.forEach(function (x) { x.readOnly = !!on; }); },
        error: function (text) { row.classList.remove('mo-win'); row.classList.remove('mo-bad'); void row.offsetWidth; row.classList.add('mo-bad'); msg.className = 'mo-msg mo-e'; msg.textContent = text || ''; setTimeout(function () { api.clear(); row.classList.add('mo-bad'); msg.className = 'mo-msg mo-e'; msg.textContent = text || ''; setTimeout(function () { row.classList.remove('mo-bad'); }, 520); }, 520); },
        win: function () { row.classList.remove('mo-bad'); row.classList.add('mo-win'); msg.className = 'mo-msg mo-o'; msg.textContent = 'Code accepted'; fireworks(row); return new Promise(function (res) { setTimeout(res, REDUCE ? 300 : 1100); }); },
      };
      boxes.forEach(function (b, idx) {
        b.addEventListener('input', function () {
          b.value = b.value.replace(/\D/g, '').slice(-1); row.classList.remove('mo-bad', 'mo-win'); if (msg.className.indexOf('mo-e') > -1) { msg.textContent = ''; msg.className = 'mo-msg'; }
          fillClass(b); if (b.value) { popBox(b); if (idx < 5) boxes[idx + 1].focus(); }
          var s = setVal(); if (full() && opts.onComplete) setTimeout(function () { opts.onComplete(s); }, 220);
        });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !b.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ''; fillClass(boxes[idx - 1]); setVal(); }
          else if (e.key === 'ArrowLeft' && idx > 0) boxes[idx - 1].focus(); else if (e.key === 'ArrowRight' && idx < 5) boxes[idx + 1].focus();
          else if (e.key === 'Enter' && opts.onComplete && full()) { e.preventDefault(); opts.onComplete(setVal()); }
        });
        b.addEventListener('focus', function () { try { b.select(); } catch (e) { } });
        b.addEventListener('paste', function (e) {
          var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!t) return; e.preventDefault();
          t.split('').forEach(function (d, k) { setTimeout(function () { boxes[k].value = d; fillClass(boxes[k]); popBox(boxes[k]); setVal(); }, k * 60); });
          setTimeout(function () { boxes[Math.min(t.length, 5)].focus(); if (t.length === 6 && opts.onComplete) opts.onComplete(setVal()); }, t.length * 60 + 220);
        });
      });
      if (input.value) { input.value.replace(/\D/g, '').slice(0, 6).split('').forEach(function (d, k) { boxes[k].value = d; fillClass(boxes[k]); }); }
      if (opts.autofocus !== false) setTimeout(function () { api.focus(); }, 30);
      return api;
    }
  };
})();
