/* The system's white pop-up boxes replace the browser's grey alert / confirm / prompt boxes.
     node tests/sync/dialogs-test.js ecosystem/index.html */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

/* 1. no browser box is left, and every await sits inside an async function (the page must still parse) */
const script = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const stripped = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const native = [...stripped.matchAll(/(?<![A-Za-z0-9_$.])(confirm|prompt|alert)\(/g)].map(m => m[1]);
T('no native confirm / prompt / alert is left in the page', native.length === 0, native.join(','));
let parsed = true; try { [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m => new vm.Script(m[1])); } catch (e) { parsed = false; console.log(e.message); }
T('the page script still parses (every await is in an async function)', parsed);

/* 2. the dialogs themselves, on a tiny fake of the page */
const a = src.indexOf('const dlgText='), b = src.indexOf('const bal=B=>') > 0 ? src.indexOf('/* ---- end System dialogs') : -1;
const end = src.indexOf('const dlgPrompt=');
const endFn = src.indexOf('\n', src.indexOf('[{t:o.no||\'Cancel\',cls:\'ghost\',v:null,cancel:null}', end));
const code = src.slice(a, endFn + 1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let last = null;
function fakeModal(title, html, o) {
  const btns = [...html.matchAll(/data-dl="(\d+)"/g)].map(m => +m[1]);
  const els = {}; btns.forEach(i => els['[data-dl="' + i + '"]'] = { onclick: null, click() { this.onclick && this.onclick() }, focus() {} });
  els['#dlgIn'] = { value: '', focus() {} }; els['#dlgErr'] = { textContent: '' };
  const m = { _wrap: {}, html, title, o, closed: false, querySelector(s) { return els[s] || (s.startsWith('input') ? null : null) }, els };
  last = m; return m;
}
const closeModal = m => { m.closed = true; if (m._wrap._onclose) m._wrap._onclose(); };
const X = new Function('esc', 'modal', 'closeModal', code + '\nreturn {dlgAlert,dlgConfirm,dlgAsk,dlgPrompt,DLG_RED};')(esc, fakeModal, closeModal);

(async () => {
  let p = X.dlgConfirm('Delete this?'); last.els['[data-dl="1"]'].click(); T('Confirm button answers true', (await p) === true);
  p = X.dlgConfirm('Delete this?'); last.els['[data-dl="0"]'].click(); T('Cancel button answers false', (await p) === false);
  p = X.dlgConfirm('Keep going?'); closeModal(last); T('the close (X) icon / Esc answers false for a question', (await p) === false);
  p = X.dlgAsk('Reason:'); last.els['#dlgIn'].value = '  wrong room  '; last.els['[data-dl="1"]'].click(); T('a typed answer comes back trimmed', (await p) === 'wrong room');
  p = X.dlgAsk('Reason:'); last.els['[data-dl="0"]'].click(); T('Cancel on a typed question answers null, as the old prompt did', (await p) === null);
  p = X.dlgAsk('Reason:'); closeModal(last); T('the X icon on a typed question answers null', (await p) === null);
  p = X.dlgAsk('Count the cash', '1500'); T('the default value is shown', /value="1500"|>1500</.test(last.html)); last.els['[data-dl="1"]'].click(); await p;
  p = X.dlgAsk('Enter your current password'); T('a password question hides what is typed', /type="password"/.test(last.html)); closeModal(last); await p;
  p = X.dlgAlert('You are not eligible to do this function'); T('an alert shows the text in a white box and has one OK button', /You are not eligible to do this function/.test(last.html) && (last.html.match(/data-dl=/g) || []).length === 1); last.els['[data-dl="0"]'].click(); T('OK closes the alert', (await p) === true && last.closed);
  T('a question about deleting or resetting gets the red button, an ordinary one does not', X.DLG_RED.test('Delete this line?') && X.DLG_RED.test('Reset the terms to the default text?') && !X.DLG_RED.test('Print this folio now?'));
  T('a message with < > is shown as text, not as page code', (() => { X.dlgAlert('a <b>bold</b> trick'); const ok = !/<b>bold<\/b>/.test(last.html) && /&lt;b&gt;/.test(last.html); closeModal(last); return ok })());
  console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
