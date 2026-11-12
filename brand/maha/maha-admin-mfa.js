/* Maha Hub: the Authenticator step of an admin (platform owner) in a system that does not have its own (CRM, Billing, the later ones).
   The sign-in answered "admin_mode: needs_mfa": this device is new for the admin, or its 14 days are over.
   MahaAdminMfa.step({url, key, deviceId, access_token}) shows the 6-digit box (the QR code first when the admin has no Authenticator yet),
   then asks the server to trust this device for 14 days, and resolves {access_token, refresh_token, expires_in}, or null when it is closed.
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
  var ask = function (kind, info, again) {
    return new Promise(function (resolve) {
      var enrol = kind === 'enrol';
      var w = document.createElement('div');
      w.setAttribute('role', 'dialog');
      w.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.62);padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      w.innerHTML = '<div style="background:#fff;color:#1b2430;border-radius:14px;width:min(440px,100%);padding:22px 22px 18px;box-shadow:0 12px 40px rgba(0,0,0,.35)">'
        + '<h2 style="margin:0 0 8px;font-size:18px">' + (enrol ? 'Set up the Authenticator' : 'Authenticator code') + '</h2>'
        + (enrol
          ? '<p style="margin:0 0 8px;font-size:13.5px;line-height:1.45">Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). If you cannot scan it, type the key into the app instead.</p>'
            + '<div style="text-align:center;margin:8px 0"><img alt="QR code" src="' + esc(info.qr) + '" style="width:190px;height:190px;background:#fff"></div>'
            + '<p style="margin:0 0 8px;font-size:12.5px;word-break:break-all"><b>Key:</b> ' + esc(info.secret) + '</p>'
            + '<p style="margin:0 0 8px;font-size:13.5px">Then type the 6-digit code the app shows.</p>'
          : '<p style="margin:0 0 8px;font-size:13.5px;line-height:1.45">Type the 6-digit code from your authenticator app. This device is then trusted for 14 days.</p>')
        + '<input id="mamC" inputmode="numeric" autocomplete="one-time-code" maxlength="8" style="width:100%;box-sizing:border-box;font-size:20px;letter-spacing:4px;text-align:center;padding:9px;border:1px solid #b8c0cc;border-radius:8px;background:#fff;color:#1b2430">'
        + '<div id="mamE" role="alert" style="min-height:18px;margin:6px 0;font-size:12.5px;color:#b3261e">' + (again ? 'That code was not accepted. Use the newest code from the app.' : '') + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="mamX" style="padding:8px 14px;border-radius:8px;border:1px solid #b8c0cc;background:#fff;color:#1b2430;cursor:pointer">Cancel</button>'
        + '<button type="button" id="mamG" style="padding:8px 16px;border-radius:8px;border:0;background:#1f6f54;color:#fff;font-weight:600;cursor:pointer">' + (enrol ? 'Turn on and continue' : 'Continue') + '</button></div></div>';
      document.body.appendChild(w);
      var done = false;
      var finish = function (v) { if (done) return; done = true; try { w.remove(); } catch (e) { } resolve(v); };
      var c = w.querySelector('#mamC');
      w.querySelector('#mamG').onclick = function () {
        var v = (c.value || '').replace(/\s+/g, '');
        if (!/^\d{6}$/.test(v)) { w.querySelector('#mamE').textContent = 'Enter the 6 digits.'; return; }
        finish(v);
      };
      c.onkeydown = function (e) { if (e.key === 'Enter') w.querySelector('#mamG').onclick(); };
      w.querySelector('#mamX').onclick = function () { finish(null); };
      setTimeout(function () { try { c.focus(); } catch (e) { } }, 30);
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
