/* A tiny Chrome DevTools helper (no packages): starts Edge or Chrome without a window, opens pages, runs code in them and saves screenshots.
   Used by tools/site-shots.mjs to take the real screens of the Maha systems for the website. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(port = 9333) {
  const exe = BROWSERS.find(p => fs.existsSync(p)); if (!exe) throw new Error('No Edge or Chrome found');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--remote-allow-origins=*', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { await sleep(250); try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { list = null; } }
  if (!list) { proc.kill(); throw new Error('The browser did not start'); }
  const target = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    send,
    size: (w, h, scale = 2, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile }),
    go: async url => { await send('Page.navigate', { url }); await sleep(1200); },
    eval: async (code) => { const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || 'eval failed'); return r.result.value; },
    sleep,
    shot: async (file, o = {}) => {
      const r = await send('Page.captureScreenshot', { format: o.format || 'webp', quality: o.quality || 88, ...(o.clip ? { clip: { scale: 1, ...o.clip } } : {}), captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file;
    },
    close: () => { try { ws.close(); } catch { } try { proc.kill(); } catch { } },
  };
}
