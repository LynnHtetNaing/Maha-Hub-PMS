// Enewletter: the HTML the editor makes is cleaned before sending; one attachment is checked.
const path = require('path'), { pathToFileURL } = require('url');
(async () => {
  const { cleanHtml, cleanAttachment, textOf } = await import(pathToFileURL(path.join(__dirname, '../../supabase/functions/crm-send-mail/clean.mjs')).href);
  let fails = 0; const T = (n, ok) => { if (!ok) { fails++; console.log('FAIL', n); } };
  const c = cleanHtml('<h2 style="color:#b8741a;position:fixed">Hi</h2><p onclick="x()">A <b>b</b><script>alert(1)</script></p><img src="javascript:alert(1)"><img src="https://x.com/a.png" onerror="y()"><a href="javascript:z()">bad</a><a href="https://maha-hub.com" style="background-color:#0A3020;color:#fff;padding:10px 18px">ok</a><iframe src="https://e.com"></iframe><img src=x onerror=alert(1)');
  T('script removed', !/script|alert\(1\)<|iframe/i.test(c.replace(/&lt;img src=x onerror=alert\(1\)/, '')));
  T('onclick/onerror removed', !/onclick|onerror="/.test(c));
  T('unsafe style dropped, colour kept', c.includes('color:#b8741a') && !c.includes('position'));
  T('javascript links dropped', !/href="javascript|src="javascript/i.test(c));
  T('https link and button style kept', c.includes('href="https://maha-hub.com"') && c.includes('background-color:#0A3020'));
  T('https image kept', c.includes('<img src="https://x.com/a.png" />'));
  T('a broken tag is shown as text, never run', c.includes('&lt;img src=x') && !/<img src=x/.test(c));
  T('text version', textOf('<p>Hello <b>you</b></p><p>Bye</p>') === 'Hello you\nBye');
  T('attachment ok', !!cleanAttachment({ name: 'Rates 2027.pdf', content: 'QUJD' }));
  T('attachment bad type', !cleanAttachment({ name: 'run.exe', content: 'QUJD' }) && !cleanAttachment({ name: '../x.pdf', content: 'QUJD' }));
  T('attachment too big', !cleanAttachment({ name: 'a.pdf', content: 'A'.repeat(4_300_000) }));
  console.log(fails ? 'FAILED ' + fails : 'all ok');
})();
