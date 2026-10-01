import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.BUFFER_API_KEY || '';
const PORT = Number(process.env.PORT || 8780);
const HOST = '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}

function gqlString(value) {
  return JSON.stringify(String(value));
}

function publicMessage(text) {
  const msg = String(text || 'Buffer did not accept the post.');
  return KEY ? msg.split(KEY).join('') : msg;
}

async function buffer(query) {
  const res = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function status() {
  if (!KEY) return { connected: false, organization: '', channels: [] };
  const org = await buffer('query { account { organizations { id name } } }');
  if (org.status === 401 || (org.body.errors && org.body.errors.length)) {
    return { connected: false, organization: '', channels: [], message: publicMessage('Buffer did not accept the server key.') };
  }
  const list = org.body.data && org.body.data.account && org.body.data.account.organizations || [];
  const first = list[0];
  if (!first) return { connected: true, organization: '', channels: [] };
  const ch = await buffer('query { channels(input: { organizationId: ' + gqlString(first.id) + ' }) { id name displayName service isQueuePaused } }');
  const channels = (ch.body.data && ch.body.data.channels) || [];
  return {
    connected: true,
    organization: first.name || '',
    channels: channels.map(c => ({
      id: c.id,
      name: c.name || '',
      displayName: c.displayName || c.name || c.service || 'Channel',
      service: c.service || '',
      paused: !!c.isQueuePaused
    }))
  };
}

async function queue(input) {
  const channelId = String(input.channelId || '');
  const text = String(input.text || '').trim();
  const dueAt = String(input.dueAt || '');
  if (!/^[A-Za-z0-9]+$/.test(channelId)) return { ok: false, message: 'That channel is not valid.' };
  if (!text) return { ok: false, message: 'Write the post before adding it to Buffer.' };
  if (text.length > 5000) return { ok: false, message: 'Buffer accepts 5,000 characters. Shorten the post.' };
  if (!KEY) return { ok: false, message: 'Buffer is not connected on this server.' };
  let when = '';
  if (dueAt) {
    const time = new Date(dueAt);
    if (Number.isNaN(time.getTime()) || time.getTime() < Date.now() + 60000) {
      return { ok: false, message: 'Choose a time at least a minute from now, or leave the time empty.' };
    }
    when = time.toISOString();
  }
  const mode = when ? 'customScheduled' : 'addToQueue';
  const extra = when ? ', dueAt: ' + gqlString(when) : '';
  const query = 'mutation { createPost(input: { text: ' + gqlString(text) + ', channelId: ' + gqlString(channelId) + ', schedulingType: automatic, mode: ' + mode + extra + ' }) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }';
  const res = await buffer(query);
  const err = res.body.errors && res.body.errors[0];
  if (err) return { ok: false, message: publicMessage(err.message) };
  const result = res.body.data && res.body.data.createPost;
  if (!result) return { ok: false, message: 'Buffer did not accept the post.' };
  if (result.message) return { ok: false, message: publicMessage(result.message) };
  return { ok: true, id: result.post && result.post.id, dueAt: result.post && result.post.dueAt };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 200000) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('\0')) return '';
  const rel = path.normalize(clean).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return '';
  if (path.basename(full).startsWith('.')) return '';
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + HOST);
    if (url.pathname === '/api/buffer' && req.method === 'POST') {
      const input = await readBody(req);
      const op = input.op === 'queue' ? 'queue' : 'status';
      const out = op === 'queue' ? await queue(input) : await status();
      send(res, 200, JSON.stringify(out));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, '{"message":"Method not allowed"}');
      return;
    }
    let target = fileFor(url.pathname === '/' ? '/reach/index.html' : url.pathname);
    if (target && fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    send(res, 200, fs.readFileSync(target), TYPES[ext] || 'application/octet-stream');
  } catch (e) {
    send(res, 400, JSON.stringify({ message: 'The request could not be read.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log('Maha Reach listening on http://' + HOST + ':' + PORT + '/reach/');
});
