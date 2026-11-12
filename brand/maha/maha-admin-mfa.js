/* Maha Hub: the Authenticator step of an admin (platform owner) in a system that does not have its own (PMS address, CRM, Billing, the later ones).
   The sign-in answered "admin_mode: needs_mfa": this browser is new for the admin, or its 14 days are over.
   MahaAdminMfa.step({url, key, deviceId, access_token}) shows the Maha pop-up (the QR code first when the admin has no Authenticator yet, then the 6-digit code),
   then asks the server to trust this browser for 14 days, and resolves {access_token, refresh_token, expires_in}, or null when it is closed.
   The look is the Maha look of the sign-in box: the grey Maha box, the logo and MAHA HUB lettering, the Maha font, forest green and gold.
   No secrets are stored here; the session of the admin is the only thing that is used. */
(function () {
  'use strict';
  var api = function (cfg, method, path, body, token) {
    return fetch(cfg.url + '/auth/v1' + path, { method: method, headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!res.ok) { var e = new Error((d && (d.msg || d.message || d.error_description)) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
          return d;
        });
      });
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var STYLE_ID = 'mahaMfaStyle';
  var css = [
    '.mam{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;overflow:auto;background:rgba(10,48,32,.5);font-family:Inter,"Noto Sans","Noto Sans Thai","Noto Sans Myanmar",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}',
    '.mam *{box-sizing:border-box}',
    '.mamb{background:#eceff0;color:#1f2d36;border-radius:26px;width:min(460px,100%);padding:26px 28px 22px;box-shadow:0 40px 60px -18px rgba(8,40,30,.5),0 14px 26px rgba(8,40,30,.22)}',
    '.mamh{display:flex;align-items:center;gap:12px;margin:0 0 14px}.mamh img{width:52px;height:auto;filter:brightness(.4) saturate(3.4) contrast(1.35)}.mamh b{font:800 20px/1 Inter,"Noto Sans",system-ui,sans-serif;letter-spacing:.14em;color:#0b3d2e}',
    '.mam h2{margin:0 0 6px;font-size:22px;font-weight:700}.mam p{margin:6px 0;color:#556470;font-size:14.5px;line-height:1.5}',
    '.mam ol{margin:8px 0 12px;padding-left:20px;color:#556470;font-size:14px;line-height:1.55}.mam ol b{color:#1f2d36}',
    '.mamqr{display:flex;justify-content:center;margin:10px 0}.mamqr img{width:196px;height:196px;background:#fff;border-radius:16px;padding:10px;box-shadow:0 1px 6px rgba(0,0,0,.12)}',
    '.mamkey{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #c5d0d8;border-radius:12px;padding:8px 10px;margin:8px 0 12px}.mamkey code{flex:1;font:600 12.5px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;color:#1f2d36}',
    '.mamkey button{border:1px solid #c5d0d8;background:#fff;border-radius:9px;padding:6px 12px;font:600 13px Inter,"Noto Sans",system-ui,sans-serif;color:#184D3A;cursor:pointer}',
    '.mamd{display:flex;gap:8px;justify-content:center;margin:12px 0 6px}.mamd input{width:48px;height:58px;border:1.5px solid #c5d0d8;border-radius:12px;background:#fff;text-align:center;font:700 24px Inter,"Noto Sans",system-ui,sans-serif;color:#1f2d36;padding:0}',
    '.mamd input:focus{outline:2px solid #D49A38;border-color:#D49A38}.mamd input.bad{border-color:#B4432F}',
    '.mame{min-height:20px;margin:4px 0 8px;font-size:13.5px;color:#B4432F;text-align:center}',
    '.mamf{display:flex;flex-direction:column;gap:8px}.mamg{border:0;border-radius:14px;background:#0A3020;color:#fff;font:700 16px Inter,"Noto Sans",system-ui,sans-serif;padding:14px;cursor:pointer}.mamg:hover{background:#184D3A}.mamg[disabled]{background:#dfe5e8;color:#9aa6ae;cursor:default}',
    '.mamx{border:0;background:transparent;color:#556470;font:600 14px Inter,"Noto Sans",system-ui,sans-serif;padding:8px;cursor:pointer}.mamx:hover{color:#1f2d36}',
    '@media(max-width:420px){.mamb{padding:20px 16px 16px;border-radius:20px}.mamd{gap:6px}.mamd input{width:42px;height:52px;font-size:22px}}',
  ].join('');
  var ask = function (kind, info, again) {
    return new Promise(function (resolve) {
      var enrol = kind === 'enrol';
      if (!document.getElementById(STYLE_ID)) { var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css; document.head.appendChild(st); }
      var w = document.createElement('div'); w.className = 'mam'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
      var digits = ''; for (var i = 0; i < 6; i++) digits += '<input inputmode="numeric" autocomplete="' + (i === 0 ? 'one-time-code' : 'off') + '" maxlength="1" aria-label="Digit ' + (i + 1) + '">';
      w.innerHTML = '<div class="mamb"><div class="mamh"><img src="/brand/maha/gate-gold.png" alt=""><b>MAHA HUB</b></div>'
        + '<h2>' + (enrol ? 'Set up two-step sign-in' : 'Two-step sign-in') + '</h2>'
        + (enrol
          ? '<p>Your account needs an Authenticator app. You do this once.</p><ol><li>Open an authenticator app: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> or <b>Authy</b>.</li><li><b>Scan</b> this QR code.</li><li>Type the <b>6-digit code</b> the app shows.</li></ol>'
            + '<div class="mamqr"><img alt="QR code" src="' + esc(info.qr) + '"></div>'
            + '<div class="mamkey"><code id="mamKey">' + esc(info.secret) + '</code><button type="button" id="mamCp">Copy</button></div><p style="margin-top:-4px;font-size:12.5px">Cannot scan? Type this key into the app instead.</p>'
          : '<p>Type the 6-digit code from your authenticator app. This browser is then trusted for 14 days.</p>')
        + '<div class="mamd" id="mamD">' + digits + '</div><div class="mame" id="mamE" role="alert">' + (again ? 'That code was not accepted. Use the newest code from the app.' : '') + '</div>'
        + '<div class="mamf"><button type="button" class="mamg" id="mamG" disabled>' + (enrol ? 'Turn on and continue' : 'Continue') + '</button><button type="button" class="mamx" id="mamX">Cancel</button></div></div>';
      document.body.appendChild(w);
      var done = false, boxes = w.querySelectorAll('#mamD input'), go = w.querySelector('#mamG');
      var finish = function (v) { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); try { w.remove(); } catch (e) { } resolve(v); };
      var read = function () { var s = ''; for (var k = 0; k < boxes.length; k++) s += boxes[k].value; return s; };
      var check = function () { go.disabled = !/^\d{6}$/.test(read()); };
      var submit = function () { var v = read(); if (!/^\d{6}$/.test(v)) { w.querySelector('#mamE').textContent = 'Enter the 6 digits.'; return; } finish(v); };
      var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
      document.addEventListener('keydown', onKey, true);
      boxes.forEach(function (b, idx) {
        b.addEventListener('input', function () { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && idx < 5) boxes[idx + 1].focus(); check(); if (read().length === 6 && !go.disabled) submit(); });
        b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ''; check(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'ArrowLeft' && idx > 0) boxes[idx - 1].focus(); else if (e.key === 'ArrowRight' && idx < 5) boxes[idx + 1].focus(); });
        b.addEventListener('paste', function (e) { var t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6); if (!t) return; e.preventDefault(); for (var k = 0; k < 6; k++) boxes[k].value = t[k] || ''; boxes[Math.min(t.length, 5)].focus(); check(); if (t.length === 6) submit(); });
      });
      go.onclick = submit; w.querySelector('#mamX').onclick = function () { finish(null); };
      var cp = w.querySelector('#mamCp'); if (cp) cp.onclick = function () { try { navigator.clipboard.writeText(info.secret); cp.textContent = 'Copied'; } catch (e) { } };
      setTimeout(function () { try { boxes[0].focus(); } catch (e) { } }, 30);
    });
  };
  var keep = function (d) { return { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in }; };
  window.MahaAdminMfa = {
    step: function (o) {
      var cfg = { url: o.url, key: o.key }, tok = o.access_token;
      return api(cfg, 'GET', '/user', null, tok).then(function (user) {
        var factors = (user && user.factors) || [];
        var verified = factors.filter(function (f) { return f.factor_type === 'totp' && f.status === 'verified'; });
        var chain = Promise.resolve(), pending = null, factorId = null;
        if (verified.length) factorId = verified[0].id;
        else {
          factors.forEach(function (f) { if (f.status !== 'verified') chain = chain.then(function () { return api(cfg, 'DELETE', '/factors/' + f.id, null, tok).catch(function () { }); }); });
          chain = chain.then(function () { return api(cfg, 'POST', '/factors', { factor_type: 'totp', friendly_name: 'Maha Hub admin ' + Date.now(), issuer: 'Maha Hub' }, tok); })
            .then(function (p) { pending = p; factorId = p.id; });
        }
        return chain.then(function () {
          var attempt = function (n) {
            if (n >= 5) return null;
            return ask(pending ? 'enrol' : 'verify', pending && pending.totp ? { qr: pending.totp.qr_code, secret: pending.totp.secret } : null, n > 0).then(function (code) {
              if (!code) { if (pending) api(cfg, 'DELETE', '/factors/' + factorId, null, tok).catch(function () { }); return null; }
              return api(cfg, 'POST', '/factors/' + factorId + '/challenge', null, tok)
                .then(function (ch) { return api(cfg, 'POST', '/factors/' + factorId + '/verify', { challenge_id: ch.id, code: code }, tok); })
                .then(function (ver) {
                  var t = keep(ver);
                  return fetch(cfg.url + '/functions/v1/username-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + t.access_token }, body: JSON.stringify({ action: 'trust_device', device_id: o.deviceId }) })
                    .catch(function () { }).then(function () { return t; });
                }, function (e) { if (e && (e.status === 400 || e.status === 422)) return attempt(n + 1); throw e; });
            });
          };
          return attempt(0);
        });
      });
    }
  };
})();
