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
    '.mame{min-height:20px;margin:4px 0 8px;font-size:13.5px;color:#B4432F;text-align:center}',
    '.mamf{display:flex;flex-direction:column;gap:8px}.mamg{border:0;border-radius:14px;background:#0A3020;color:#fff;font:700 16px Inter,"Noto Sans",system-ui,sans-serif;padding:14px;cursor:pointer}.mamg:hover{background:#184D3A}.mamg[disabled]{background:#dfe5e8;color:#9aa6ae;cursor:default}',
    '.mamx{border:0;background:transparent;color:#556470;font:600 14px Inter,"Noto Sans",system-ui,sans-serif;padding:8px;cursor:pointer}.mamx:hover{color:#1f2d36}',
    '@media(max-width:420px){.mamb{padding:20px 16px 16px;border-radius:20px}}',
  ].join('');
  /* the pop-up: it checks the code itself (verify(code) answers { ok, value } or { ok:false, msg }), so a right code can play the fireworks and a wrong one shakes the boxes */
  var ask = function (kind, info, verify) {
    return new Promise(function (resolve) {
      var enrol = kind === 'enrol';
      if (!document.getElementById(STYLE_ID)) { var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = css; document.head.appendChild(st); }
      var w = document.createElement('div'); w.className = 'mam'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
      w.innerHTML = '<div class="mamb"><div class="mamh"><img src="/brand/maha/gate-gold.png" alt=""><b>MAHA HUB</b></div>'
        + '<h2>' + (enrol ? 'Set up two-step sign-in' : 'Two-step sign-in') + '</h2>'
        + (enrol
          ? '<p>Your account needs an Authenticator app. You do this once.</p><ol><li>Open an authenticator app: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> or <b>Authy</b>.</li><li><b>Scan</b> this QR code.</li><li>Type the <b>6-digit code</b> the app shows.</li></ol>'
            + '<div class="mamqr"><img alt="QR code" src="' + esc(info.qr) + '"></div>'
            + '<div class="mamkey"><code id="mamKey">' + esc(info.secret) + '</code><button type="button" id="mamCp">Copy</button></div><p style="margin-top:-4px;font-size:12.5px">Cannot scan? Type this key into the app instead.</p>'
          : '<p>Type the 6-digit code from your authenticator app. This browser is then trusted for 14 days.</p>')
        + '<input id="mamC" value="">'
        + '<div class="mamf"><button type="button" class="mamg" id="mamG" disabled>' + (enrol ? 'Turn on and continue' : 'Continue') + '</button><button type="button" class="mamx" id="mamX">Cancel</button></div></div>';
      document.body.appendChild(w);
      var done = false, input = w.querySelector('#mamC'), go = w.querySelector('#mamG'), otp = null, working = false;
      var finish = function (v) { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); try { w.remove(); } catch (e) { } resolve(v); };
      var submit = function (code) {
        code = String(code || input.value || '');
        if (working || !/^\d{6}$/.test(code)) return;
        working = true; go.disabled = true; otp && otp.busy(true);
        Promise.resolve(verify(code)).then(function (r) {
          working = false; otp && otp.busy(false);
          if (r && r.ok) { (otp ? otp.win() : Promise.resolve()).then(function () { finish(r.value); }); }
          else { go.disabled = true; if (otp) otp.error((r && r.msg) || 'That code was not accepted. Use the newest code from the app.'); }
        });
      };
      var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
      document.addEventListener('keydown', onKey, true);
      input.addEventListener('input', function () { go.disabled = !/^\d{6}$/.test(input.value); });
      if (window.MahaOtp) otp = window.MahaOtp.attach(input, { onComplete: submit });
      go.onclick = function () { submit(input.value); };
      w.querySelector('#mamX').onclick = function () { finish(null); };
      var cp = w.querySelector('#mamCp'); if (cp) cp.onclick = function () { try { navigator.clipboard.writeText(info.secret); cp.textContent = 'Copied'; } catch (e) { } };
      if (!otp) { input.type = 'text'; input.maxLength = 6; input.inputMode = 'numeric'; input.placeholder = '6-digit code'; input.style.cssText = 'width:100%;font-size:22px;text-align:center;padding:12px;border-radius:12px;border:1px solid #c5d0d8;margin:12px 0'; setTimeout(function () { input.focus(); }, 30); }
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
          /* the code is checked inside the pop-up; a right code also makes this browser trusted for 14 days */
          var verify = function (code) {
            return api(cfg, 'POST', '/factors/' + factorId + '/challenge', null, tok)
              .then(function (ch) { return api(cfg, 'POST', '/factors/' + factorId + '/verify', { challenge_id: ch.id, code: code }, tok); })
              .then(function (ver) {
                var t = keep(ver);
                return fetch(cfg.url + '/functions/v1/username-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + t.access_token }, body: JSON.stringify({ action: 'trust_device', device_id: o.deviceId }) })
                  .catch(function () { }).then(function () { return { ok: true, value: t }; });
              }, function (e) {
                if (e && (e.status === 400 || e.status === 422)) return { ok: false, msg: 'That code was not accepted. Use the newest code from the app.' };
                return { ok: false, msg: 'The two-step sign-in service did not answer. Try again in a moment.' };
              });
          };
          return ask(pending ? 'enrol' : 'verify', pending && pending.totp ? { qr: pending.totp.qr_code, secret: pending.totp.secret } : null, verify).then(function (t) {
            if (!t) { if (pending) api(cfg, 'DELETE', '/factors/' + factorId, null, tok).catch(function () { }); return null; }
            return t;
          });
        });
      });
    }
  };
})();
