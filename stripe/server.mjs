/**
 * Maha Hub — Stripe Checkout helper (test or live).
 * Creates Checkout Sessions with 3D Secure so guests get a real bank OTP
 * (live) or Stripe’s test authentication page (test mode).
 *
 * Env (or stripe/.env — never commit secrets):
 *   STRIPE_SECRET_KEY       sk_test_… or sk_live_…
 *   STRIPE_PUBLISHABLE_KEY  pk_test_… or pk_live_… (returned by /api/status)
 *   MAHA_STRIPE_PORT        default 8783
 *   MAHA_STRIPE_HOST        default 127.0.0.1
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const i = s.indexOf('=');
      if (i < 1) return;
      const k = s.slice(0, i).trim();
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
    });
  } catch {}
}
loadDotEnv();

const PORT = Number(process.env.MAHA_STRIPE_PORT || 8783);
const HOST = process.env.MAHA_STRIPE_HOST || '127.0.0.1';
const SECRET = (process.env.STRIPE_SECRET_KEY || '').trim();
const PUBLISHABLE = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

async function stripeForm(path, params, method = 'POST') {
  if (!SECRET) throw new Error('STRIPE_SECRET_KEY is not set on this server');
  const body = new URLSearchParams();
  const add = (key, val) => {
    if (val == null || val === '') return;
    if (typeof val === 'object' && !Array.isArray(val)) {
      Object.entries(val).forEach(([k, v]) => add(`${key}[${k}]`, v));
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (typeof v === 'object') Object.entries(v).forEach(([k, vv]) => add(`${key}[${i}][${k}]`, vv));
        else add(`${key}[${i}]`, v);
      });
      return;
    }
    body.append(key, String(val));
  };
  Object.entries(params || {}).forEach(([k, v]) => add(k, v));
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + SECRET,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ('Stripe HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Zero-decimal currencies per Stripe (amount already in major units → multiply by 100 unless listed). */
const ZERO_DECIMAL = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);
function toStripeAmount(amount, currency) {
  const cur = String(currency || 'thb').toLowerCase();
  const n = +amount;
  if (!(n > 0)) throw new Error('Amount must be greater than 0');
  if (ZERO_DECIMAL.has(cur)) return Math.round(n);
  return Math.round(n * 100);
}

async function createCheckout(input) {
  const currency = String(input.currency || 'THB').toLowerCase();
  const unitAmount = toStripeAmount(input.amount, currency);
  const guest = String(input.guest || 'Guest').slice(0, 120);
  const ref = String(input.ref || '').slice(0, 80);
  const note = String(input.note || '').slice(0, 200);
  const linkId = String(input.linkId || input.id || '').slice(0, 64);
  const hotel = String(input.hotel || '').slice(0, 32);
  const successUrl = String(input.successUrl || '').trim();
  const cancelUrl = String(input.cancelUrl || '').trim();
  if (!successUrl || !cancelUrl) throw new Error('successUrl and cancelUrl are required');

  const productName = note || (ref ? `Hotel charge · ${ref}` : 'Hotel charge');
  const description = [guest, ref, hotel].filter(Boolean).join(' · ');

  const session = await stripeForm('/checkout/sessions', {
    mode: 'payment',
    success_url: successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? successUrl
      : successUrl + (successUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl,
    client_reference_id: linkId || undefined,
    customer_email: input.email || undefined,
    payment_method_types: ['card'],
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][unit_amount]': unitAmount,
    'line_items[0][price_data][product_data][name]': productName.slice(0, 120),
    'line_items[0][price_data][product_data][description]': description.slice(0, 200) || undefined,
    'payment_intent_data[metadata][linkId]': linkId || undefined,
    'payment_intent_data[metadata][hotel]': hotel || undefined,
    'payment_intent_data[metadata][guest]': guest || undefined,
    'payment_intent_data[metadata][ref]': ref || undefined,
    'payment_method_options[card][request_three_d_secure]': 'any',
    'metadata[linkId]': linkId || undefined,
    'metadata[hotel]': hotel || undefined,
    'metadata[guest]': guest || undefined,
    'metadata[ref]': ref || undefined,
  });

  return {
    ok: true,
    id: session.id,
    url: session.url,
    paymentIntent: session.payment_intent || null,
    mode: session.mode,
    livemode: !!session.livemode,
  };
}

async function stripeGet(path) {
  if (!SECRET) throw new Error('STRIPE_SECRET_KEY is not set on this server');
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + SECRET },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ('Stripe HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function cardFromSession(session) {
  const pi = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const pm = pi && pi.payment_method && typeof pi.payment_method === 'object' ? pi.payment_method : null;
  const card = pm && pm.card ? pm.card : null;
  if (!card) {
    return {
      brand: (session.payment_method_types && session.payment_method_types[0]) || 'card',
      last4: '',
      exp: '',
      holder: (session.customer_details && session.customer_details.name) || '',
      stripe: true,
    };
  }
  const exp = card.exp_month && card.exp_year
    ? String(card.exp_month).padStart(2, '0') + '/' + String(card.exp_year).slice(-2)
    : '';
  return {
    brand: String(card.brand || 'card').toUpperCase(),
    last4: card.last4 || '',
    exp,
    holder: (pm.billing_details && pm.billing_details.name) || (session.customer_details && session.customer_details.name) || '',
    stripe: true,
    paymentMethodId: pm.id || '',
    threeDSecure: (pi && pi.status) || session.payment_status || '',
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  const u = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && u.pathname === '/api/status') {
      return send(res, 200, {
        ok: true,
        service: 'maha-stripe',
        hasSecret: !!SECRET,
        publishableKey: PUBLISHABLE || null,
        livemode: SECRET.startsWith('sk_live_'),
        testMode: SECRET.startsWith('sk_test_') || !SECRET,
        note: SECRET
          ? 'Stripe keys loaded. Checkout Sessions will request 3D Secure.'
          : 'Set STRIPE_SECRET_KEY (and optional STRIPE_PUBLISHABLE_KEY) then restart.',
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/checkout') {
      const body = await readBody(req);
      const out = await createCheckout(body);
      return send(res, 200, out);
    }

    if (req.method === 'GET' && u.pathname.startsWith('/api/session/')) {
      const id = decodeURIComponent(u.pathname.slice('/api/session/'.length));
      if (!id) return send(res, 400, { ok: false, error: 'missing session id' });
      const session = await stripeGet(
        '/checkout/sessions/' + encodeURIComponent(id) +
        '?expand[]=payment_intent&expand[]=payment_intent.payment_method'
      );
      const paid = session.payment_status === 'paid' || session.status === 'complete';
      return send(res, 200, {
        ok: true,
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        paid,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details && session.customer_details.email,
        metadata: session.metadata || {},
        card: paid ? cardFromSession(session) : null,
        livemode: !!session.livemode,
      });
    }

    send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    send(res, e.status && e.status < 500 ? e.status : 500, {
      ok: false,
      error: e.message || String(e),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Maha Stripe helper on http://${HOST}:${PORT}`);
  console.log(SECRET ? `Secret key loaded (${SECRET.slice(0, 12)}…)` : 'WARNING: STRIPE_SECRET_KEY not set');
});
