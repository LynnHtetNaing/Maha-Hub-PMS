/* The pages a customer opens from Maha Hub:
     crm.maha-hub.com/book/talk   "Talk with the Team"  a 10 minute call
     crm.maha-hub.com/book/demo   "Book a Demo"         60 minutes, a confirmation email
     crm.maha-hub.com/r/<token>   the link in an Enewletter: an answer button, or "Choose a time" (the same booking page)
   Booking in three steps with a loading screen between them: 1 choose the day (Week or Month view) and the time, 2 fill in the details, 3 the confirmation.
   The page holds no secret. It talks to the Supabase functions crm-book and crm-reply, which check everything again.
   The look is the Maha look: forest green, gold for what is chosen, white boxes on the soft page. Big on a laptop, comfortable on a phone. */

export const REPLY_CSS = [
  ':root{--forest:#0A3020;--forest2:#184D3A;--gold:#D49A38;--goldsoft:#FBF3E0;--canopy:#eef1f3;--ink:#1a272f;--ink2:#556470;--line:#c5d0d8;--alert:#B4432F;--ok:#1F8A4C}',
  '*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--canopy);color:var(--ink);font:16px/1.5 "Noto Sans","Noto Sans Thai",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh}',
  '.top{background:var(--forest);color:#fff;padding:16px clamp(16px,4vw,40px);display:flex;align-items:center;gap:14px}',
  '.top img{width:46px;height:46px;border-radius:12px;box-shadow:0 0 0 2px rgba(212,154,56,.6)}.top b{display:block;font-size:19px;letter-spacing:.2px}.top span{display:block;font-size:14px;color:#f3d9a0}',
  '.top .len{margin-left:auto;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:5px 14px;font-size:14px;white-space:nowrap}',
  '.wrap{max-width:900px;margin:0 auto;padding:clamp(18px,4vw,42px) clamp(14px,4vw,28px) 60px}',
  'h1{margin:0 0 6px;font-size:clamp(22px,3.4vw,30px);text-align:center;color:var(--ink)}h2{margin:0 0 6px;font-size:22px}.sub{text-align:center;color:var(--ink2);margin:0 0 22px}p{margin:6px 0;color:var(--ink2)}.e{color:var(--alert)}',
  '.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:clamp(16px,3vw,30px);box-shadow:0 8px 30px rgba(10,48,32,.07)}',
  '.seg{display:inline-flex;background:#e6ebee;border-radius:12px;padding:4px;margin:0 auto 16px}.seg button{border:0;background:transparent;border-radius:9px;padding:9px 22px;font:inherit;font-weight:600;color:var(--ink2)}.seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.12)}',
  '.ctr{text-align:center}.nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.nav b{font-size:18px;color:var(--forest2)}',
  '.arr{width:44px;height:44px;border:1px solid var(--line);background:#fff;border-radius:12px;font-size:20px;line-height:1;color:var(--ink);cursor:pointer}.arr[disabled]{opacity:.35;cursor:default}',
  '.dow,.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.dow span{text-align:center;font-size:13px;font-weight:600;color:var(--ink2);padding:8px 0;background:#f1f4f6;border-radius:8px}',
  '.day{min-height:clamp(58px,9vw,84px);border:1.5px solid transparent;border-radius:14px;background:#f6f8f9;color:#a2adb4;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:clamp(16px,2.4vw,20px);font-weight:600;font-family:inherit}',
  '.day small{font-size:12px;font-weight:500}.day.on{background:#fff;border-color:var(--line);color:var(--ink);cursor:pointer}.day.on:hover{border-color:var(--forest2)}.day.sel{background:var(--forest);border-color:var(--forest);color:#fff}.day.sel small{color:#f3d9a0}',
  '.week .day{min-height:clamp(78px,12vw,108px)}',
  '.tm{margin:26px 0 4px;text-align:center}.meta{color:var(--ink2);font-size:15px;text-align:center;margin:0 0 14px}',
  '.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
  '.slot{min-height:56px;border:1.5px solid var(--line);background:#fff;border-radius:14px;font:inherit;font-weight:700;font-size:17px;color:var(--ink);cursor:pointer}.slot:hover{border-color:var(--forest2);background:#f1f7f3}',
  '.back{border:0;background:transparent;font:inherit;color:var(--ink2);cursor:pointer;padding:8px 0;margin-bottom:6px}.back:hover{color:var(--ink)}',
  '.pickd{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--goldsoft);border:1px solid #ecd7a8;border-radius:14px;padding:14px 18px;margin:0 0 20px}.pickd b{display:block}.pickd a{color:var(--forest2);font-weight:700;text-decoration:underline;cursor:pointer}',
  '.f{display:block;margin:0 0 14px}.f span{display:block;font-size:14px;font-weight:600;margin-bottom:5px}.f i{color:var(--alert);font-style:normal}',
  '.f input,.f textarea{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:13px 14px;font:inherit;font-size:16px;background:#fff;color:var(--ink)}.f input:focus,.f textarea:focus{outline:2px solid var(--gold);border-color:var(--gold)}',
  '.f textarea{min-height:90px;resize:vertical}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
  '.lnk{border:0;background:transparent;color:var(--forest2);font:inherit;font-weight:700;cursor:pointer;padding:6px 0;margin-bottom:10px}',
  '.go{display:block;width:100%;background:var(--forest);color:#fff;font:inherit;font-weight:700;font-size:17px;border:0;border-radius:14px;padding:16px;cursor:pointer}.go:hover{background:var(--forest2)}.go[disabled]{background:#dfe5e8;color:#9aa6ae;cursor:default}',
  '.gold{background:var(--gold);color:var(--ink)}.gold:hover{background:#c98d2e}',
  '.load{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:var(--ink2)}',
  '.ring{position:relative;width:84px;height:84px}.ring i{position:absolute;inset:0;border-radius:50%;border:4px solid #e3e8eb;border-top-color:var(--gold);animation:sp 0.9s linear infinite}.ring img{position:absolute;inset:14px;width:56px;height:56px;border-radius:14px}',
  '@keyframes sp{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.ring i{animation-duration:2.4s}}',
  '.done{text-align:center;padding:10px 0}.tick{width:76px;height:76px;border-radius:50%;background:var(--ok);color:#fff;font-size:42px;line-height:76px;margin:0 auto 14px}',
  '.sum{background:var(--goldsoft);border:1px solid #ecd7a8;border-radius:14px;padding:16px 18px;margin:18px auto;max-width:520px;text-align:left}.sum b{display:block;font-size:18px}.sum div{margin-top:4px;color:var(--ink)}',
  '.btnrow{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:12px}.btnrow a{display:inline-block;border-radius:12px;padding:13px 22px;font-weight:700;text-decoration:none;background:var(--gold);color:var(--ink)}',
  '@media(max-width:640px){.top .len{display:none}.two{grid-template-columns:1fr}.slots{grid-template-columns:1fr 1fr}.seg button{padding:9px 18px}.dow,.grid{gap:4px}.pickd{flex-direction:column;align-items:flex-start}}',
].join('');

/* runs in the browser: written as a normal function and sent as text */
export function clientScript(cfg) {
  var FN = cfg.fn, ROOT = document.getElementById('root'), TOKEN = '', TYPE = cfg.type || '', INFO = null, AV = null, ST = { view: 'week', date: '', time: '', anchor: '', month: '' }, timer = null, guests = [], F = {};
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var LOGO = '/brand/maha/gate-gold.png';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function D(iso) { return new Date(iso + 'T12:00:00Z'); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function plus(isoDate, n) { return iso(new Date(D(isoDate).getTime() + n * 86400000)); }
  function t12(t) { var h = Number(t.slice(0, 2)), m = t.slice(3, 5), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; return h + ':' + m + ' ' + ap; }
  function longDay(d) { var x = D(d); return DOWL[x.getUTCDay()] + ', ' + x.getUTCDate() + ' ' + MON[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); }
  function lenText(n) { return n >= 60 ? (n % 60 ? n + ' minute' : (n / 60) + (n === 60 ? ' hour' : ' hours')) : n + ' minute'; }
  function shell(inner, withTop) {
    var title = INFO && INFO.type ? INFO.type.title : 'Maha Hub';
    ROOT.innerHTML = '<div class="top"><img src="' + LOGO + '" alt=""><div><b>Maha Hub</b><span>' + esc(withTop === false ? '' : title) + '</span></div>' + (INFO && INFO.type ? '<div class="len">' + lenText(INFO.type.len) + '</div>' : '') + '</div><div class="wrap">' + inner + '</div>';
  }
  /* the loading screen between the steps: it stays at least a moment, so the change is calm */
  function loading(text, minMs, work, then) {
    shell('<div class="card"><div class="load"><div class="ring"><i></i><img src="' + LOGO + '" alt=""></div><div>' + esc(text) + '</div></div></div>');
    var t0 = Date.now(), res, err;
    Promise.resolve().then(work).then(function (r) { res = r; }, function (e) { err = e || true; }).then(function () {
      setTimeout(function () { then(res, err); }, Math.max(0, minMs - (Date.now() - t0)));
    });
  }
  function api(method, qs, body) {
    var url = FN + '/' + (qs.fn || 'crm-book') + '?' + qs.q;
    return fetch(url, { method: method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); });
  }
  function q() { return TOKEN ? 't=' + encodeURIComponent(TOKEN) : 'type=' + encodeURIComponent(TYPE); }

  /* ---- an answer button of an Enewletter (Yes / No / interested) ---- */
  function answer(d) {
    if (d.done) { shell('<div class="card done"><div class="tick">&#10003;</div><h2>Thank you</h2><p>We already have your answer.</p></div>', false); return; }
    shell('<div class="card"><h2>' + esc(d.label) + '</h2><p>' + esc(d.title || '') + '</p><label class="f"><span>A message for us (optional)</span><textarea id="n" maxlength="500"></textarea></label><button class="go gold" id="g">Confirm</button><p class="e" id="e"></p></div>', false);
    document.getElementById('g').onclick = function () {
      var g = this; g.disabled = true;
      loading('Saving your answer', 900, function () { return api('POST', { fn: 'crm-reply', q: '' }, { t: TOKEN, note: document.getElementById('n').value }); }, function (x) {
        if (x && x.ok) { shell('<div class="card done"><div class="tick">&#10003;</div><h2>Thank you</h2><p>We received your answer. We will be in touch.</p></div>', false); return; }
        if (x && x.error === 'slot_taken') { shell('<div class="card done"><h2>This time is no longer free</h2><p>Please reply to our email and we will find another time.</p></div>', false); return; }
        answer(d); document.getElementById('e').textContent = 'It could not be saved. Please try again.';
      });
    };
  }

  /* ---- step 1: the day and the time ---- */
  function loadAv() {
    return api('GET', { q: q() + '&av=1&days=42' }).then(function (a) { AV = a; return a; });
  }
  function firstDay() { var k = Object.keys((AV && AV.days) || {}).sort(); return k[0] || ''; }
  function step1(msg) {
    var days = (AV && AV.days) || {}, keys = Object.keys(days).sort(), today = (AV && AV.today) || iso(new Date());
    var lastOk = plus(today, (AV && AV.ahead) || 21);
    if (!keys.length) { shell('<div class="card done"><h2>There is no free time right now</h2><p>Please try again later, or reply to our email and we will find a time with you.</p></div>'); return; }
    if (!ST.date || !days[ST.date]) { ST.date = keys[0]; ST.time = ''; }
    if (!ST.anchor) ST.anchor = ST.date;
    if (!ST.month) ST.month = ST.date.slice(0, 7);
    var head = '<h1>What day is best for you?</h1><p class="sub">Choose a day, then a time. All times are Indochina Time (ICT, Bangkok).</p>';
    var seg = '<div class="ctr"><div class="seg"><button data-v="week" class="' + (ST.view === 'week' ? 'on' : '') + '">Week</button><button data-v="month" class="' + (ST.view === 'month' ? 'on' : '') + '">Month</button></div></div>';
    var nav, cells = '', i, d, n, cls;
    if (ST.view === 'week') {
      var a = D(ST.anchor), start = iso(new Date(a.getTime() - a.getUTCDay() * 86400000)), end = plus(start, 6);
      nav = '<div class="nav"><button class="arr" id="pv" ' + (start <= today ? 'disabled' : '') + ' aria-label="Previous week">&#8249;</button><b>' + D(start).getUTCDate() + ' ' + MON[D(start).getUTCMonth()] + ' - ' + D(end).getUTCDate() + ' ' + MON[D(end).getUTCMonth()] + ' ' + D(end).getUTCFullYear() + '</b><button class="arr" id="nx" ' + (end >= lastOk ? 'disabled' : '') + ' aria-label="Next week">&#8250;</button></div>';
      for (i = 0; i < 7; i++) { d = plus(start, i); n = days[d] ? days[d].length : 0; cells += dayCell(d, n, true); }
    } else {
      var y = Number(ST.month.slice(0, 4)), m = Number(ST.month.slice(5, 7)) - 1, first = new Date(Date.UTC(y, m, 1, 12)), lead = first.getUTCDay(), dim = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
      var prevM = iso(new Date(Date.UTC(y, m - 1, 1, 12))).slice(0, 7), nextM = iso(new Date(Date.UTC(y, m + 1, 1, 12))).slice(0, 7);
      nav = '<div class="nav"><button class="arr" id="pv" ' + (ST.month <= today.slice(0, 7) ? 'disabled' : '') + ' aria-label="Previous month">&#8249;</button><b>' + MON[m] + ' ' + y + '</b><button class="arr" id="nx" ' + (nextM > lastOk.slice(0, 7) ? 'disabled' : '') + ' aria-label="Next month">&#8250;</button></div>';
      for (i = 0; i < lead; i++) cells += '<div></div>';
      for (i = 1; i <= dim; i++) { d = y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + i).slice(-2); n = days[d] ? days[d].length : 0; cells += dayCell(d, n, false); }
      void prevM;
    }
    function dayCell(dd, nn, big) {
      cls = 'day' + (nn ? ' on' : '') + (ST.date === dd ? ' sel' : '');
      return '<button class="' + cls + '" ' + (nn ? 'data-d="' + dd + '"' : 'disabled') + '>' + (big ? '<small>' + MON[D(dd).getUTCMonth()].slice(0, 3) + '</small>' : '') + D(dd).getUTCDate() + (nn && big ? '<small>' + nn + ' free</small>' : '') + '</button>';
    }
    var slots = (days[ST.date] || []).map(function (t) { return '<button class="slot" data-t="' + t + '">' + t12(t) + '</button>'; }).join('');
    shell('<div class="card ' + ST.view + '">' + head + (msg ? '<p class="e ctr">' + esc(msg) + '</p>' : '') + seg + nav + '<div class="dow">' + DOW.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="grid">' + cells + '</div>'
      + '<h1 class="tm" style="font-size:22px">What time works?</h1><p class="meta">' + esc(longDay(ST.date)) + ' &bull; ' + lenText(INFO.type.len) + ' &bull; Indochina Time (ICT)</p><div class="slots">' + slots + '</div></div>');
    var els, k;
    els = ROOT.querySelectorAll('[data-v]'); for (k = 0; k < els.length; k++) els[k].onclick = function () { ST.view = this.getAttribute('data-v'); ST.anchor = ST.date; ST.month = ST.date.slice(0, 7); step1(); };
    els = ROOT.querySelectorAll('[data-d]'); for (k = 0; k < els.length; k++) els[k].onclick = function () { ST.date = this.getAttribute('data-d'); step1(); };
    els = ROOT.querySelectorAll('[data-t]'); for (k = 0; k < els.length; k++) els[k].onclick = function () { ST.time = this.getAttribute('data-t'); toForm(); };
    var pv = document.getElementById('pv'), nx = document.getElementById('nx');
    if (pv) pv.onclick = function () { if (ST.view === 'week') ST.anchor = plus(ST.anchor, -7); else ST.month = iso(new Date(Date.UTC(Number(ST.month.slice(0, 4)), Number(ST.month.slice(5, 7)) - 2, 1, 12))).slice(0, 7); step1(); };
    if (nx) nx.onclick = function () { if (ST.view === 'week') ST.anchor = plus(ST.anchor, 7); else ST.month = iso(new Date(Date.UTC(Number(ST.month.slice(0, 4)), Number(ST.month.slice(5, 7)), 1, 12))).slice(0, 7); step1(); };
  }

  /* ---- step 2: the details ---- */
  function toForm() { loading('Preparing your booking', 700, function () { return null; }, function () { step2(); }); }
  function step2(msg) {
    var tp = INFO.type, pre = INFO.prefill || {};
    F.email = F.email != null ? F.email : (pre.email || ''); F.hotel = F.hotel != null ? F.hotel : (pre.hotel || '');
    var guestHtml = '';
    if (tp.key !== 'talk') {
      guestHtml = guests.length ? guests.map(function (g, i) { return '<label class="f"><span>Guest ' + (i + 1) + ' email</span><input type="email" data-g="' + i + '" value="' + esc(g) + '" autocomplete="off"></label>'; }).join('') : '';
      guestHtml += (guests.length < 3 ? '<button type="button" class="lnk" id="ag">+ Invite additional guests</button>' : '');
    }
    shell('<div class="card"><button class="back" id="bk">&#8249; Back</button><h1 style="text-align:left">Almost there!</h1>'
      + '<div class="pickd"><div><b>' + esc(longDay(ST.date)) + '</b>' + t12(ST.time) + ' &bull; ' + lenText(tp.len) + ' &bull; Indochina Time (ICT)</div><a id="ch">Change</a></div>'
      + (msg ? '<p class="e">' + esc(msg) + '</p>' : '')
      + '<div class="two"><label class="f"><span>First name <i>*</i></span><input id="fn" autocomplete="given-name" placeholder="Your first name..." value="' + esc(F.first || '') + '"></label><label class="f"><span>Last name <i>*</i></span><input id="ln" autocomplete="family-name" placeholder="Your last name..." value="' + esc(F.last || '') + '"></label></div>'
      + '<label class="f"><span>Email <i>*</i></span><input id="em" type="email" autocomplete="email" placeholder="youremail@domain.com" value="' + esc(F.email) + '"></label>'
      + '<label class="f"><span>Hotel name <i>*</i></span><input id="ht" autocomplete="organization" placeholder="Your hotel or company..." value="' + esc(F.hotel) + '"></label>'
      + '<label class="f"><span>Phone ' + (tp.phone ? '<i>*</i>' : '(optional)') + '</span><input id="ph" type="tel" autocomplete="tel" placeholder="+66 ..." value="' + esc(F.phone || '') + '"></label>'
      + '<label class="f"><span>Anything you would like to share? (optional)</span><textarea id="nt" maxlength="500">' + esc(F.note || '') + '</textarea></label>'
      + guestHtml + '<input class="hp" id="wb" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="go" id="ok" disabled>Confirm ' + (tp.key === 'talk' ? 'Call' : 'Meeting') + '</button></div>');
    var ids = { fn: 'first', ln: 'last', em: 'email', ht: 'hotel', ph: 'phone', nt: 'note' }, k, ok = document.getElementById('ok');
    function read() { for (k in ids) F[ids[k]] = document.getElementById(k).value.trim(); var gs = ROOT.querySelectorAll('[data-g]'), j; guests = []; for (j = 0; j < gs.length; j++) guests.push(gs[j].value.trim()); }
    function check() { read(); ok.disabled = !(F.first && F.last && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(F.email) && F.hotel && (!tp.phone || F.phone)); }
    for (k in ids) document.getElementById(k).oninput = check;
    var gl = ROOT.querySelectorAll('[data-g]'), j; for (j = 0; j < gl.length; j++) gl[j].oninput = check;
    var ag = document.getElementById('ag'); if (ag) ag.onclick = function () { read(); guests.push(''); step2(); };
    document.getElementById('bk').onclick = function () { read(); step1(); };
    document.getElementById('ch').onclick = function () { read(); step1(); };
    check();
    ok.onclick = function () {
      read();
      var body = { type: TYPE, t: TOKEN, slot: { date: ST.date, time: ST.time }, first: F.first, last: F.last, email: F.email, hotel: F.hotel, phone: F.phone, note: F.note, guests: guests.filter(function (g) { return g; }), website: document.getElementById('wb').value };
      loading('Booking your time', 1100, function () { return api('POST', { q: '' }, body); }, function (x, err) {
        if (x && x.ok) { step3(x); return; }
        if (x && x.error === 'slot_taken') { ST.time = ''; loadAv().then(function () { step1('Someone just took that time. Please choose another one.'); }); return; }
        if (x && x.error === 'too_many') { step2('You already have two bookings with us. Please reply to your confirmation email to change one.'); return; }
        step2(err || (x && x.error === 'check_the_form') ? 'Please check the details and try again.' : 'It could not be saved. Please try again.');
      });
    };
  }

  /* ---- step 3: the confirmation ---- */
  function step3(x) {
    clearInterval(timer);
    var talk = INFO.type.key === 'talk';
    shell('<div class="card done"><div class="tick">&#10003;</div><h1>' + (talk ? 'We have your request' : 'You are booked') + '</h1>'
      + '<p>' + (talk ? 'Our team will call you at the time you chose.' : (x.mailed ? 'A confirmation was sent to <b>' + esc(F.email) + '</b>.' : 'Your meeting is confirmed.')) + '</p>'
      + '<div class="sum"><b>' + esc(x.title || INFO.type.title) + '</b><div>' + esc(longDay(x.date || ST.date)) + '</div><div>' + t12(x.time || ST.time) + ' &bull; ' + lenText(x.len || INFO.type.len) + ' &bull; Indochina Time (ICT)</div>' + (talk && F.phone ? '<div>We will call: ' + esc(F.phone) + '</div>' : '') + '</div>'
      + (talk ? '' : '<div class="btnrow"><a href="' + gcal(x) + '" target="_blank" rel="noopener">Add to Google Calendar</a></div>')
      + '<p style="margin-top:22px">You can close this page now.</p></div>');
  }
  function gcal(x) {
    var s = new Date((x.date || ST.date) + 'T' + (x.time || ST.time) + ':00+07:00').getTime(), e = s + (x.len || INFO.type.len) * 60000;
    function u(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent((x.title || INFO.type.title) + ' - Maha Hub') + '&dates=' + u(s) + '/' + u(e) + '&ctz=Asia%2FBangkok';
  }

  /* ---- start ---- */
  function startBooking() {
    loading('Opening the calendar', 800, function () {
      return api('GET', { q: q() }).then(function (info) { if (!info || !info.ok) throw info || true; INFO = info; if (info.done) return null; return loadAv(); });
    }, function (r, err) {
      if (err || !INFO) { shell('<div class="card done"><h2>This link is not valid</h2><p>Please ask Maha Hub to send it again.</p></div>', false); return; }
      if (INFO.done) { shell('<div class="card done"><div class="tick">&#10003;</div><h2>Thank you</h2><p>We already have your time.</p></div>', false); return; }
      step1();
      /* real time: the free times are asked again every 30 seconds and when the page comes back to the front */
      timer = setInterval(function () { if (document.hidden || !ROOT.querySelector('.slots')) return; loadAv().then(function () { if (ST.time && !(AV.days[ST.date] && AV.days[ST.date].indexOf(ST.time) >= 0)) ST.time = ''; if (ROOT.querySelector('.slots')) step1(); }); }, 30000);
    });
  }

  if (cfg.mode === 'book') { TYPE = cfg.type; startBooking(); }
  else {
    TOKEN = location.pathname.split('/').pop();
    shell('<div class="card"><div class="load"><div class="ring"><i></i><img src="' + LOGO + '" alt=""></div><div>Loading</div></div></div>', false);
    api('GET', { fn: 'crm-reply', q: 't=' + encodeURIComponent(TOKEN) }).then(function (d) {
      if (!d || !d.ok) { shell('<div class="card done"><h2>This link is not valid</h2><p>Please ask Maha Hub to send it again.</p></div>', false); return; }
      if (d.kind === 'book') { startBooking(); return; }
      answer(d);
    }).catch(function () { shell('<div class="card done"><h2>Please try again</h2><p>The page could not load.</p></div>', false); });
  }
}
