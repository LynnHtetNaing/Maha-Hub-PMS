/**
 * Maha Connect — Phase 1 foundation server.
 * Local APIs for property/room/rate/inventory + channel registry.
 * Does NOT call live OTAs. Does NOT store OTA secrets in the repo.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONNECT_VERSION,
  propertyFromHubSnapshot,
  readiness,
  buildInventoryDay,
  isoDate,
  uid
} from './core.js';
import { createStore } from './store.js';
import { createMockAdapter } from './adapters/mock.js';
import { createMiddleProviderAdapter } from './adapters/middle-provider.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const STORE_PATH = path.join(DATA, 'store.json');
const PORT = Number(process.env.MAHA_CONNECT_PORT || process.env.PORT || 8782);
const HOST = process.env.MAHA_CONNECT_HOST || '127.0.0.1';

const store = createStore(STORE_PATH);
const mockAdapters = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function adapterFor(channelCode, connection) {
  if (channelCode === 'MOCK') {
    if (!mockAdapters.has(connection.id)) mockAdapters.set(connection.id, createMockAdapter(connection));
    return mockAdapters.get(connection.id);
  }
  if (channelCode === 'MIDDLE') return createMiddleProviderAdapter(connection, process.env);
  return null;
}

function publicConnection(c) {
  return {
    id: c.id,
    propertyId: c.propertyId,
    channelId: c.channelId,
    channelCode: c.channelCode,
    externalPropertyId: c.externalPropertyId || null,
    status: c.status,
    lastSuccessAt: c.lastSuccessAt || null,
    lastFailureAt: c.lastFailureAt || null,
    lastError: c.lastError || null,
    hasCredentials: !!c.credentialsEnc,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

async function handleApi(req, res, url) {
  const db = store.read();
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  if (req.method === 'GET' && parts[0] === 'status') {
    return send(res, 200, {
      ok: true,
      service: 'maha-connect',
      version: CONNECT_VERSION,
      ...readiness(db)
    });
  }

  if (req.method === 'GET' && parts[0] === 'channels' && parts.length === 1) {
    return send(res, 200, { channels: db.channels });
  }

  if (req.method === 'GET' && parts[0] === 'properties' && parts.length === 1) {
    return send(res, 200, { properties: db.properties });
  }

  if (req.method === 'GET' && parts[0] === 'properties' && parts[1]) {
    const prop = db.properties.find(p => p.id === parts[1] || p.hubCode === parts[1]);
    if (!prop) return send(res, 404, { error: 'property-not-found' });
    return send(res, 200, {
      property: prop,
      roomTypes: db.roomTypes.filter(r => r.propertyId === prop.id),
      ratePlans: db.ratePlans.filter(r => r.propertyId === prop.id),
      connections: db.connections.filter(c => c.propertyId === prop.id).map(publicConnection)
    });
  }

  if (req.method === 'GET' && parts[0] === 'room-types') {
    const propertyId = url.searchParams.get('propertyId');
    let rows = db.roomTypes;
    if (propertyId) rows = rows.filter(r => r.propertyId === propertyId);
    return send(res, 200, { roomTypes: rows });
  }

  if (req.method === 'GET' && parts[0] === 'rate-plans') {
    const propertyId = url.searchParams.get('propertyId');
    let rows = db.ratePlans;
    if (propertyId) rows = rows.filter(r => r.propertyId === propertyId);
    return send(res, 200, { ratePlans: rows });
  }

  if (req.method === 'GET' && parts[0] === 'inventory') {
    const propertyId = url.searchParams.get('propertyId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!propertyId) return send(res, 400, { error: 'propertyId-required' });
    let rows = db.inventory.filter(i => i.propertyId === propertyId);
    if (from) rows = rows.filter(i => i.stayDate >= from);
    if (to) rows = rows.filter(i => i.stayDate < to);
    rows.sort((a, b) => (a.roomTypeCode || '').localeCompare(b.roomTypeCode || '') || a.stayDate.localeCompare(b.stayDate));
    return send(res, 200, { inventory: rows });
  }

  if (req.method === 'POST' && parts[0] === 'hub' && parts[1] === 'publish') {
    const body = await readBody(req);
    if (!body || !body.hotel || !body.hotel.code) return send(res, 400, { error: 'hotel-required' });
    const bundle = propertyFromHubSnapshot(body.hotel, body.orgId || 'org_padauk');
    store.upsertPropertyBundle(bundle);
    return send(res, 200, {
      ok: true,
      propertyId: bundle.property.id,
      hubCode: bundle.property.hubCode,
      roomTypes: bundle.roomTypes.length,
      ratePlans: bundle.ratePlans.length,
      inventoryDays: bundle.inventory.length,
      message: 'Hub snapshot imported into Maha Connect foundation store.'
    });
  }

  if (req.method === 'POST' && parts[0] === 'inventory' && parts[1] === 'update') {
    const body = await readBody(req);
    if (!body?.propertyId || !body?.roomTypeId || !body?.stayDate) {
      return send(res, 400, { error: 'propertyId-roomTypeId-stayDate-required' });
    }
    const rt = db.roomTypes.find(r => r.id === body.roomTypeId && r.propertyId === body.propertyId);
    if (!rt) return send(res, 404, { error: 'room-type-not-found' });
    const day = buildInventoryDay(rt, body.stayDate, body);
    store.update(data => {
      const idx = data.inventory.findIndex(i =>
        i.propertyId === body.propertyId && i.roomTypeId === body.roomTypeId && i.stayDate === body.stayDate
      );
      const row = { ...day, propertyId: body.propertyId, id: idx >= 0 ? data.inventory[idx].id : uid('inv') };
      if (idx >= 0) data.inventory[idx] = row;
      else data.inventory.push(row);
    });
    return send(res, 200, { ok: true, inventory: day });
  }

  if (req.method === 'POST' && parts[0] === 'connections') {
    const body = await readBody(req);
    const prop = db.properties.find(p => p.id === body?.propertyId);
    const ch = db.channels.find(c => c.id === body?.channelId || c.code === body?.channelCode);
    if (!prop || !ch) return send(res, 400, { error: 'property-or-channel-not-found' });
    if (ch.code === 'MIDDLE') {
      return send(res, 403, {
        error: 'middle-not-configured',
        message: 'Middle provider is a placeholder. Select a certified provider first (see PROVIDER-CRITERIA.md).'
      });
    }
    let conn;
    store.update(data => {
      const existing = data.connections.find(c => c.propertyId === prop.id && c.channelId === ch.id);
      const now = new Date().toISOString();
      if (existing) {
        existing.status = 'connected';
        existing.updatedAt = now;
        existing.lastSuccessAt = now;
        existing.lastError = null;
        existing.externalPropertyId = body.externalPropertyId || existing.externalPropertyId || `EXT-${prop.hubCode || prop.id}`;
        conn = existing;
      } else {
        conn = {
          id: uid('conn'),
          propertyId: prop.id,
          channelId: ch.id,
          channelCode: ch.code,
          externalPropertyId: body.externalPropertyId || `EXT-${prop.hubCode || prop.id}`,
          status: 'connected',
          credentialsEnc: null,
          lastSuccessAt: now,
          lastFailureAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now
        };
        data.connections.push(conn);
      }
    });
    const adapter = adapterFor(ch.code, conn);
    if (adapter) await adapter.connect();
    return send(res, 200, { ok: true, connection: publicConnection(conn) });
  }

  if (req.method === 'POST' && parts[0] === 'connections' && parts[1] && parts[2] === 'test') {
    const conn = db.connections.find(c => c.id === parts[1]);
    if (!conn) return send(res, 404, { error: 'connection-not-found' });
    const adapter = adapterFor(conn.channelCode, conn);
    if (!adapter) return send(res, 400, { error: 'adapter-missing' });
    const result = await adapter.testConnection();
    store.update(data => {
      const c = data.connections.find(x => x.id === conn.id);
      if (!c) return;
      if (result.ok) {
        c.lastSuccessAt = new Date().toISOString();
        c.lastError = null;
        c.status = 'connected';
      } else {
        c.lastFailureAt = new Date().toISOString();
        c.lastError = result.error || 'test-failed';
        c.status = result.status || 'error';
      }
      c.updatedAt = new Date().toISOString();
    });
    return send(res, result.ok ? 200 : 502, result);
  }

  if (req.method === 'GET' && parts[0] === 'connections') {
    const propertyId = url.searchParams.get('propertyId');
    let rows = db.connections.map(publicConnection);
    if (propertyId) rows = rows.filter(c => c.propertyId === propertyId);
    return send(res, 200, { connections: rows });
  }

  return send(res, 404, { error: 'not-found', path: url.pathname });
}

function staticFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  send(res, 200, fs.readFileSync(filePath), TYPES[ext] || 'application/octet-stream');
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
    if (staticFile(res, filePath)) return;
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (e) {
    send(res, 500, { error: 'server-error', message: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Maha Connect foundation ${CONNECT_VERSION} http://${HOST}:${PORT}/`);
  console.log('Not live on OTAs. Middle provider not configured.');
});
