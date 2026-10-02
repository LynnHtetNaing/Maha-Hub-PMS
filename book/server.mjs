/**
 * Maha Booking Engine — local server for landing pages, catalog API, and Google-format feeds.
 * Does NOT push to Google. Does NOT claim live connectivity.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOK_VERSION,
  searchHotel,
  quoteStay,
  readiness,
  isoDate,
  addDays
} from './catalog.js';
import {
  hotelListXml,
  landingPagesXml,
  ariTransactionXml,
  ariRateAmountXml,
  ariAvailXml,
  ariInvCountXml,
  statusJson
} from './feeds.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const CATALOG_PATH = path.join(DATA, 'catalog.json');
const REQUESTS_PATH = path.join(DATA, 'booking-requests.json');
const PORT = Number(process.env.MAHA_BOOK_PORT || process.env.PORT || 8781);
const HOST = process.env.MAHA_BOOK_HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extra
  });
  res.end(buf);
}

function readCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  const cat = JSON.parse(raw);
  cat.googleLive = false;
  cat.baseBookUrl = cat.baseBookUrl || `http://${HOST}:${PORT}/book`;
  return cat;
}

function writeCatalog(cat) {
  cat.googleLive = false;
  cat.updatedAt = new Date().toISOString();
  cat.version = cat.version || BOOK_VERSION;
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(cat, null, 2));
}

function readRequests() {
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeRequests(list) {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(REQUESTS_PATH, JSON.stringify(list, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 5_000_000) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function safeFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('\0')) return '';
  const rel = path.normalize(clean).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return '';
  if (path.basename(full).startsWith('.')) return '';
  return full;
}

function hotelOr404(cat, id, res) {
  const hotel = (cat.hotels || []).find(h => h.id === id);
  if (!hotel) {
    send(res, 404, JSON.stringify({ message: 'Hotel not found in the public catalog.' }));
    return null;
  }
  return hotel;
}

function parseQuery(url) {
  const q = {};
  url.searchParams.forEach((v, k) => { q[k] = v; });
  return q;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const p = url.pathname;

    if (req.method === 'OPTIONS') {
      send(res, 204, '', 'text/plain', {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return;
    }

    if (p === '/api/status' && req.method === 'GET') {
      send(res, 200, JSON.stringify(statusJson(readCatalog())));
      return;
    }

    if (p === '/api/catalog' && req.method === 'GET') {
      const cat = readCatalog();
      const publicHotels = (cat.hotels || [])
        .filter(h => h.bookEnabled && h.active !== false)
        .map(h => ({
          id: h.id,
          name: h.name,
          addr: h.addr,
          country: h.country,
          countryCode: h.countryCode,
          cur: h.cur,
          checkIn: h.checkIn,
          checkOut: h.checkOut,
          lat: h.lat,
          lng: h.lng,
          amenities: h.amenities,
          cancelPolicy: h.cancelPolicy,
          photoUrl: h.photoUrl,
          readiness: readiness(h)
        }));
      send(res, 200, JSON.stringify({
        googleLive: false,
        note: cat.note,
        hotels: publicHotels,
        updatedAt: cat.updatedAt
      }));
      return;
    }

    if (p === '/api/catalog' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || !Array.isArray(body.hotels)) {
        send(res, 400, JSON.stringify({ message: 'Send a catalog object with a hotels array.' }));
        return;
      }
      body.googleLive = false;
      writeCatalog(body);
      send(res, 200, JSON.stringify({
        ok: true,
        hotels: body.hotels.length,
        googleLive: false,
        message: 'Public catalog saved for Maha Booking. Not connected to Google.'
      }));
      return;
    }

    if (p.startsWith('/api/hotel/') && req.method === 'GET') {
      const id = decodeURIComponent(p.slice('/api/hotel/'.length).split('/')[0]);
      const cat = readCatalog();
      const hotel = hotelOr404(cat, id, res);
      if (!hotel) return;
      if (!hotel.bookEnabled || hotel.active === false) {
        send(res, 403, JSON.stringify({ message: 'This hotel is not open for direct booking.' }));
        return;
      }
      send(res, 200, JSON.stringify({
        googleLive: false,
        hotel: {
          id: hotel.id,
          name: hotel.name,
          addr: hotel.addr,
          phone: hotel.phone,
          email: hotel.email,
          web: hotel.web,
          cur: hotel.cur,
          svc: hotel.svc,
          vat: hotel.vat,
          taxName: hotel.taxName,
          country: hotel.country,
          countryCode: hotel.countryCode,
          checkIn: hotel.checkIn,
          checkOut: hotel.checkOut,
          lat: hotel.lat,
          lng: hotel.lng,
          amenities: hotel.amenities,
          cancelPolicy: hotel.cancelPolicy,
          photoUrl: hotel.photoUrl,
          roomTypes: hotel.roomTypes,
          rateCodes: hotel.rateCodes.filter(r => r.kind !== 'zero' && r.comp !== 'COMP' && r.comp !== 'HOUSE'),
          readiness: readiness(hotel)
        }
      }));
      return;
    }

    if (p === '/api/search' && req.method === 'GET') {
      const q = parseQuery(url);
      const cat = readCatalog();
      const hotel = hotelOr404(cat, q.hotel, res);
      if (!hotel) return;
      if (!hotel.bookEnabled || hotel.active === false) {
        send(res, 403, JSON.stringify({ message: 'This hotel is not open for direct booking.' }));
        return;
      }
      const checkin = q.checkin || isoDate(new Date());
      const checkout = q.checkout || addDays(checkin, 1);
      if (checkout <= checkin) {
        send(res, 400, JSON.stringify({ message: 'Checkout must be after check-in.' }));
        return;
      }
      const results = searchHotel(hotel, {
        checkin,
        checkout,
        adults: q.adults,
        children: q.children
      });
      send(res, 200, JSON.stringify({
        googleLive: false,
        hotel: hotel.id,
        checkin,
        checkout,
        adults: Number(q.adults || 2),
        children: Number(q.children || 0),
        currency: hotel.cur,
        results
      }));
      return;
    }

    if (p === '/api/request' && req.method === 'POST') {
      const body = await readBody(req);
      const cat = readCatalog();
      const hotel = (cat.hotels || []).find(h => h.id === body.hotel);
      if (!hotel || !hotel.bookEnabled) {
        send(res, 404, JSON.stringify({ message: 'Hotel not available for booking requests.' }));
        return;
      }
      const quote = quoteStay(hotel, {
        type: body.type,
        rateCode: body.rateCode,
        checkin: body.checkin,
        checkout: body.checkout,
        adults: Number(body.adults || 2)
      });
      if (!quote || !quote.available) {
        send(res, 409, JSON.stringify({ message: 'That room or rate is not available for these dates.' }));
        return;
      }
      const guest = {
        name: String(body.name || '').trim().slice(0, 120),
        email: String(body.email || '').trim().slice(0, 160),
        phone: String(body.phone || '').trim().slice(0, 60)
      };
      if (!guest.name || !guest.email) {
        send(res, 400, JSON.stringify({ message: 'Name and email are required.' }));
        return;
      }
      const row = {
        id: 'req-' + Date.now().toString(36),
        at: new Date().toISOString(),
        status: 'request',
        note: 'Request held for hotel confirmation. No payment taken. Not a Google booking.',
        hotel: hotel.id,
        hotelName: hotel.name,
        guest,
        checkin: body.checkin,
        checkout: body.checkout,
        adults: Number(body.adults || 2),
        children: Number(body.children || 0),
        quote
      };
      const list = readRequests();
      list.unshift(row);
      writeRequests(list.slice(0, 500));
      send(res, 200, JSON.stringify({
        ok: true,
        requestId: row.id,
        status: row.status,
        amountAfterTax: quote.amountAfterTax,
        currency: quote.currency,
        message: 'Booking request recorded for the hotel to confirm. Payment is not collected in this version.'
      }));
      return;
    }

    if (p === '/feeds/hotel-list.xml' && req.method === 'GET') {
      send(res, 200, hotelListXml(readCatalog()), 'application/xml; charset=utf-8');
      return;
    }
    if (p === '/feeds/landing-pages.xml' && req.method === 'GET') {
      send(res, 200, landingPagesXml(readCatalog()), 'application/xml; charset=utf-8');
      return;
    }
    if (p.startsWith('/feeds/ari/') && req.method === 'GET') {
      const parts = p.split('/').filter(Boolean);
      // feeds/ari/:hotel/:kind.xml
      if (parts.length >= 4) {
        const hotelId = decodeURIComponent(parts[2]);
        const kind = parts[3].replace(/\.xml$/, '');
        const cat = readCatalog();
        const days = Number(url.searchParams.get('days') || 14);
        try {
          let xml = '';
          if (kind === 'transaction') xml = ariTransactionXml(cat, hotelId);
          else if (kind === 'rates') xml = ariRateAmountXml(cat, hotelId, { days });
          else if (kind === 'avail') xml = ariAvailXml(cat, hotelId, { days });
          else if (kind === 'inventory') xml = ariInvCountXml(cat, hotelId, { days });
          else {
            send(res, 404, 'Unknown ARI feed. Use transaction, rates, avail, or inventory.', 'text/plain; charset=utf-8');
            return;
          }
          send(res, 200, xml, 'application/xml; charset=utf-8');
          return;
        } catch (e) {
          send(res, 404, JSON.stringify({ message: String(e.message || e) }));
          return;
        }
      }
    }

    if (p === '/api/google/push' && req.method === 'POST') {
      send(res, 403, JSON.stringify({
        ok: false,
        googleLive: false,
        message: 'Refused. Maha is not a Google Connectivity Partner in this build. ARI push to Google is disabled until Hotel Center approval and a real partner key exist.'
      }));
      return;
    }

    // Static files under /book → book/ directory; also allow /book/js modules
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, JSON.stringify({ message: 'Method not allowed' }));
      return;
    }

    let rel = p;
    if (rel === '/' || rel === '/book' || rel === '/book/') rel = '/index.html';
    else if (rel.startsWith('/book/')) rel = rel.slice('/book'.length) || '/index.html';
    // allow serving catalog.js / feeds.js from book root
    const target = safeFile(rel);
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    send(res, 200, fs.readFileSync(target), TYPES[ext] || 'application/octet-stream');
  } catch (e) {
    send(res, 400, JSON.stringify({ message: 'The request could not be completed.', detail: String(e.message || e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Maha Booking listening on http://${HOST}:${PORT}/book/`);
  console.log(`Feeds: http://${HOST}:${PORT}/feeds/hotel-list.xml`);
  console.log('Google live: false (Connectivity Partner approval required)');
});
