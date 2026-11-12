/* The page a hotel opens from an Enewletter: crm.maha-hub.com/r/<token>.
   - an answer button (Yes / No / interested): the hotel confirms, and may add a message;
   - a live calendar ("Choose a time"): the hotel sees the free days and times (Bangkok time), picks one and confirms.
   The page holds no secret. It talks to the Supabase function crm-reply, which checks the signed link and the free time again at the moment of confirming.
   The look is the Maha look: forest green bar with the logo, gold for what is chosen, white boxes on the soft grey page. */

export const REPLY_CSS = [
  ':root{--forest:#0A3020;--forest2:#184D3A;--gold:#D49A38;--goldsoft:#FBF3E0;--canopy:#eef1f3;--ink:#1a272f;--ink2:#556470;--line:#c5d0d8;--alert:#B4432F;--ok:#1F8A4C}',
  '*{box-sizing:border-box}body{margin:0;background:var(--canopy);color:var(--ink);font:15px/1.5 "Noto Sans","Noto Sans Thai",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:grid;place-items:start center;padding:24px 14px}',
  '.c{background:#fff;border:1px solid var(--line);border-radius:16px;width:100%;max-width:780px;overflow:hidden;box-shadow:0 6px 24px rgba(10,48,32,.08)}',
  '.h{background:var(--forest);color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.2px}.h img{width:34px;height:34px;border-radius:9px;box-shadow:0 0 0 2px rgba(212,154,56,.55)}',
  '.b{padding:20px}h1{margin:0 0 4px;font-size:21px}h2{margin:0 0 6px;font-size:20px}p{margin:6px 0;color:var(--ink2)}.e{color:var(--alert)}',
  'textarea{width:100%;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;font:inherit;margin:10px 0;resize:vertical}',
  'button{font:inherit;cursor:pointer}.go{background:var(--gold);color:var(--ink);font-weight:700;border:0;border-radius:10px;padding:11px 22px}.go[disabled]{opacity:.55;cursor:default}',
  '.cal{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:20px;margin-top:14px}',
  '.wk,.dn{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.dn span{font-size:11.5px;color:var(--ink2);text-align:center;padding-bottom:2px}',
  '.mo{font-weight:700;margin:10px 0 6px;color:var(--forest2)}',
  '.d{aspect-ratio:1/1;min-height:40px;border:1px solid transparent;border-radius:10px;background:#f3f5f6;color:#9aa6ae;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:14px}',
  '.d.on{background:var(--goldsoft);border-color:#ecd7a8;color:var(--ink);font-weight:700}.d.on:hover{border-color:var(--gold)}.d.sel{background:var(--gold);border-color:var(--gold);color:var(--ink)}',
  '.d small{font-size:10px;font-weight:400;color:var(--ink2)}.d.sel small{color:var(--ink)}',
  '.sl{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:8px}',
  '.t{border:1.5px solid var(--forest2);background:#fff;color:var(--forest2);border-radius:10px;padding:9px 4px;font-weight:700}.t:hover{background:#eef4f0}.t.sel{background:var(--forest);border-color:var(--forest);color:#fff}',
  '.pick{background:var(--goldsoft);border:1px solid #ecd7a8;border-radius:12px;padding:12px 14px;margin-top:14px}.pick b{display:block}',
  '.note{font-size:12.5px;color:var(--ink2);margin-top:10px}',
  '@media(max-width:640px){.cal{grid-template-columns:1fr}.b{padding:16px}}',
].join('');

/* runs in the browser: written as a normal function and sent as text */
export function clientScript(cfg) {
  var T = location.pathname.split('/').pop(), U = cfg.url, B = document.getElementById('b'), AV = null, SEL = { date: '', time: '' }, INFO = null, timer = null;
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function say(h) { B.innerHTML = h; }
  function thanks(t) { clearInterval(timer); say('<h2>Thank you</h2><p>' + t + '</p>'); }
  function dayName(d) { var x = new Date(d + 'T12:00:00Z'); return DOW[(x.getUTCDay() + 6) % 7] + ' ' + x.getUTCDate() + ' ' + MON[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); }
  function post(body, onOk, onFail) {
    fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (x) { if (x && x.ok) onOk(x); else onFail(x && x.error); })
      .catch(function () { onFail('network'); });
  }

  /* ---- an answer button ---- */
  function answer(d) {
    if (d.done) { thanks('We already have your answer.'); return; }
    say('<h2>' + esc(d.label) + '</h2><p>' + esc(d.title || '') + '</p><textarea id="n" maxlength="500" placeholder="A message for us (optional)"></textarea><button class="go" id="g">Confirm</button><p class="e" id="e"></p>');
    document.getElementById('g').onclick = function () {
      var g = this; g.disabled = true;
      post({ t: T, note: document.getElementById('n').value }, function () { thanks('We received your answer. We will be in touch.'); }, function (er) {
        if (er === 'slot_taken') { say('<h2>This time is no longer free</h2><p>Please reply to our email and we will find another time.</p>'); return; }
        g.disabled = false; document.getElementById('e').textContent = 'It could not be saved. Please try again.';
      });
    };
  }

  /* ---- the live calendar ---- */
  function load(cb) {
    fetch(U + '?t=' + encodeURIComponent(T) + '&av=1&days=42').then(function (r) { return r.json(); }).then(function (a) { AV = a; cb && cb(); }).catch(function () { cb && cb(); });
  }
  function calendar() {
    var d = INFO, days = (AV && AV.days) || {}, today = (AV && AV.today) || '', keys = Object.keys(days).sort();
    var what = d.what === 'meeting' ? 'meeting' : 'call';
    var h = '<h1>' + (what === 'meeting' ? 'Choose a time to meet' : 'Choose a time for our call') + '</h1><p>Hello ' + esc(d.hotel || '') + '. Pick a day, then a time. All times are Bangkok time.</p>';
    if (!keys.length) { say(h + '<p class="e">There is no free time to choose right now. Please reply to our email and we will find a time with you.</p>'); return; }
    /* weeks from the Monday of the first free day to the last free day */
    var first = new Date(keys[0] + 'T12:00:00Z'), last = new Date(keys[keys.length - 1] + 'T12:00:00Z');
    var start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000), end = new Date(last.getTime() + (6 - ((last.getUTCDay() + 6) % 7)) * 86400000), cells = '', x, iso, n;
    for (x = start; x <= end; x = new Date(x.getTime() + 86400000)) {
      iso = x.toISOString().slice(0, 10);
      n = days[iso] ? days[iso].length : 0;
      cells += '<div class="d' + (n ? ' on' : '') + (SEL.date === iso ? ' sel' : '') + '"' + (n ? ' data-d="' + iso + '" role="button" tabindex="0"' : '') + '>' + x.getUTCDate() + (n ? '<small>' + n + ' free</small>' : '') + '</div>';
    }
    var months = {}; keys.forEach(function (k) { months[MON[new Date(k + 'T12:00:00Z').getUTCMonth()] + ' ' + k.slice(0, 4)] = 1; });
    var slots = SEL.date && days[SEL.date] ? days[SEL.date].map(function (t) { return '<button class="t' + (SEL.time === t ? ' sel' : '') + '" data-t="' + t + '">' + t + '</button>'; }).join('') : '';
    say(h + '<div class="cal"><div><div class="mo">' + Object.keys(months).join(' / ') + '</div><div class="dn">' + DOW.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="wk">' + cells + '</div></div>'
      + '<div><div class="mo">' + (SEL.date ? esc(dayName(SEL.date)) : 'Choose a day') + '</div><div class="sl">' + (slots || '<p>Choose a day to see the free times.</p>') + '</div></div></div>'
      + (SEL.date && SEL.time ? '<div class="pick"><b>' + esc(dayName(SEL.date)) + ', ' + SEL.time + '</b>' + (AV && AV.len ? AV.len + ' minutes' : '') + '<textarea id="n" maxlength="500" placeholder="A message for us (optional)"></textarea><button class="go" id="g">Confirm this time</button><p class="e" id="e"></p></div>' : '')
      + '<p class="note">The free times update by themselves. If someone takes a time first, you will see it disappear.</p>');
    var i, list = B.querySelectorAll('[data-d]'), tl = B.querySelectorAll('[data-t]'), g = document.getElementById('g');
    for (i = 0; i < list.length; i++) { list[i].onclick = function () { SEL.date = this.getAttribute('data-d'); SEL.time = ''; calendar(); }; }
    for (i = 0; i < tl.length; i++) { tl[i].onclick = function () { SEL.time = this.getAttribute('data-t'); calendar(); }; }
    if (g) {
      g.onclick = function () {
        g.disabled = true;
        post({ t: T, slot: { date: SEL.date, time: SEL.time }, note: document.getElementById('n').value }, function () {
          thanks('Your time is booked: ' + esc(dayName(SEL.date)) + ' at ' + SEL.time + ' (Bangkok time). We look forward to speaking with you.');
        }, function (er) {
          if (er === 'slot_taken') { SEL.time = ''; load(function () { calendar(); var e = document.getElementById('e'); if (e) e.textContent = ''; var p = document.createElement('p'); p.className = 'e'; p.textContent = 'Someone just took that time. Please choose another one.'; B.insertBefore(p, B.children[1]); }); return; }
          g.disabled = false; document.getElementById('e').textContent = 'It could not be saved. Please try again.';
        });
      };
    }
  }
  /* real time: the free times are asked again every 30 seconds, and when the page comes back to the front */
  function watch() {
    timer = setInterval(function () { if (document.hidden) return; load(function () { if (SEL.date && SEL.time && !(AV.days[SEL.date] && AV.days[SEL.date].indexOf(SEL.time) >= 0)) SEL.time = ''; calendar(); }); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(calendar); });
  }

  fetch(U + '?t=' + encodeURIComponent(T)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok) { say('<h2>This link is not valid</h2><p>Please ask Maha Hub to send it again.</p>'); return; }
    INFO = d;
    if (d.kind === 'book') { if (d.done) { thanks('We already have your time.'); return; } load(function () { calendar(); watch(); }); return; }
    answer(d);
  }).catch(function () { say('<h2>Please try again</h2><p>The page could not load.</p>'); });
}
