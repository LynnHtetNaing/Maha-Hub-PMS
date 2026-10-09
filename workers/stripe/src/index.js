/**
 * Cloudflare Worker — Stripe Checkout + session status for Maha Hub.
 * Secrets: STRIPE_SECRET_KEY (required), STRIPE_PUBLISHABLE_KEY (optional)
 */

const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

function json(data, status = 200, corsOrigin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Account, X-Maha-Stripe-Secret',
  };
  if (corsOrigin) headers['Access-Control-Allow-Origin'] = corsOrigin;
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigins(value) {
  return String(value || 'https://maha-hub.com,https://www.maha-hub.com')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateReturnUrl(value, allowed) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw Object.assign(new Error('Return URL must be a valid absolute URL'), { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.origin)) {
    throw Object.assign(new Error('Return URL origin is not allowed'), { status: 400 });
  }
  return parsed.toString();
}

function toStripeAmount(amount, currency) {
  const cur = String(currency || 'thb').toLowerCase();
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Amount must be a finite number greater than 0'), { status: 400 });
  if (!/^[a-z]{3}$/.test(cur)) throw Object.assign(new Error('Currency must be a valid 3-letter code'), { status: 400 });
  const minorUnits = ZERO_DECIMAL.has(cur) ? Math.round(n) : Math.round(n * 100);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
    throw Object.assign(new Error('Amount is outside the supported range'), { status: 400 });
  }
  return minorUnits;
}

async function stripeForm(secret, path, params, opts = {}) {
  const body = new URLSearchParams();
  const add = (key, val) => {
    if (val == null || val === '') return;
    body.append(key, String(val));
  };
  Object.entries(params || {}).forEach(([k, v]) => add(k, v));
  const headers = {
    Authorization: 'Bearer ' + secret,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (opts.stripeAccount) headers['Stripe-Account'] = opts.stripeAccount;
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: opts.method || 'POST',
    headers,
    body: opts.method === 'GET' ? undefined : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || ('Stripe HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

async function stripeGet(secret, path, opts = {}) {
  const headers = { Authorization: 'Bearer ' + secret };
  if (opts.stripeAccount) headers['Stripe-Account'] = opts.stripeAccount;
  const res = await fetch('https://api.stripe.com/v1' + path, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || ('Stripe HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function validEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

async function createCollect(secret, input, stripeAccount) {
  const currency = String(input.currency || 'THB').toLowerCase();
  const unitAmount = toStripeAmount(input.amount, currency);
  const guest = String(input.guest || '').trim().slice(0, 120);
  const email = String(input.email || '').trim().slice(0, 200);
  const item = String(input.item || input.note || '').trim().slice(0, 120);
  const hotel = String(input.hotel || 'PAD01').slice(0, 32);
  const hotelName = String(input.hotelName || '').trim().slice(0, 120);
  const linkId = String(input.linkId || '').slice(0, 64);
  if (!item) throw Object.assign(new Error('Enter the item name'), { status: 400 });
  if (!guest) throw Object.assign(new Error('Enter the guest name'), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error('Enter a valid email'), { status: 400 });
  const opts = { stripeAccount };
  const meta = {
    'metadata[linkId]': linkId || undefined,
    'metadata[hotel]': hotel || undefined,
    'metadata[guest]': guest,
    'metadata[item]': item,
    'metadata[email]': email,
  };
  const customer = await stripeForm(secret, '/customers', { email, name: guest, ...meta }, opts);
  const draft = await stripeForm(secret, '/invoices', {
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: '7',
    auto_advance: 'false',
    description: [hotelName, item].filter(Boolean).join(' — ').slice(0, 200) || undefined,
    ...meta,
  }, opts);
  await stripeForm(secret, '/invoiceitems', {
    customer: customer.id,
    invoice: draft.id,
    amount: String(unitAmount),
    currency,
    description: item,
    ...meta,
  }, opts);
  const finalized = await stripeForm(secret, '/invoices/' + encodeURIComponent(draft.id) + '/finalize', {}, opts);
  let sent = finalized;
  let emailed = false;
  let emailError = '';
  try {
    sent = await stripeForm(secret, '/invoices/' + encodeURIComponent(draft.id) + '/send', {}, opts);
    emailed = true;
  } catch (e) {
    emailError = e.message || String(e);
  }
  const url = (sent && sent.hosted_invoice_url) || finalized.hosted_invoice_url;
  if (!url) throw new Error(emailError || 'Stripe did not return a payment link');
  const live = !!(sent.livemode || finalized.livemode);
  return {
    ok: true,
    id: sent.id || finalized.id,
    url,
    number: sent.number || finalized.number || '',
    status: sent.status || finalized.status || 'open',
    emailed,
    emailError: emailed ? '' : emailError,
    livemode: live,
    testMode: !live,
    customerEmail: email,
    kind: 'invoice',
  };
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
    holder: (pm.billing_details && pm.billing_details.name)
      || (session.customer_details && session.customer_details.name)
      || '',
    stripe: true,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const origins = allowedOrigins(env.CORS_ORIGIN);
    const cors = origin && origins.includes(origin) ? origin : '';
    // CORS is not authentication, but rejecting untrusted browser origins limits
    // accidental cross-origin use of the payment API.
    if (origin && !cors) return json({ ok: false, error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return json({}, 204, cors);

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/status') {
        const secret = (env.STRIPE_SECRET_KEY || '').trim();
        return json({
          ok: true,
          service: 'maha-stripe-worker',
          hasSecret: !!secret,
          publishableKey: (env.STRIPE_PUBLISHABLE_KEY || '').trim() || null,
          livemode: secret.startsWith('sk_live_') || secret.startsWith('rk_live_'),
          testMode: !secret || secret.startsWith('sk_test_') || secret.startsWith('rk_test_'),
          note: secret
            ? 'Stripe Worker ready. Checkout Sessions request 3D Secure.'
            : 'Set Worker secret STRIPE_SECRET_KEY.',
        }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/api/checkout') {
        const input = await request.json().catch(() => ({}));
        const secret = String(input.secret || env.STRIPE_SECRET_KEY || '').trim();
        if (!secret) throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { status: 400 });
        const stripeAccount = String(input.stripeAccount || '').trim() || undefined;
        const currency = String(input.currency || 'THB').toLowerCase();
        const unitAmount = toStripeAmount(input.amount, currency);
        const guest = String(input.guest || 'Guest').slice(0, 120);
        const ref = String(input.ref || '').slice(0, 80);
        const note = String(input.note || '').slice(0, 200);
        const linkId = String(input.linkId || input.id || '').slice(0, 64);
        const hotel = String(input.hotel || '').slice(0, 32);
        const successUrl = String(input.successUrl || '').trim();
        const cancelUrl = String(input.cancelUrl || '').trim();
        if (!successUrl || !cancelUrl) throw Object.assign(new Error('successUrl and cancelUrl are required'), { status: 400 });
        const returnOrigins = allowedOrigins(env.ALLOWED_RETURN_ORIGINS || env.CORS_ORIGIN);
        const safeSuccessUrl = validateReturnUrl(successUrl, returnOrigins);
        const safeCancelUrl = validateReturnUrl(cancelUrl, returnOrigins);

        const productName = note || (ref ? `Hotel charge · ${ref}` : 'Hotel charge');
        const description = [guest, ref, hotel].filter(Boolean).join(' · ');
        const success = safeSuccessUrl.includes('{CHECKOUT_SESSION_ID}')
          ? safeSuccessUrl
          : safeSuccessUrl + (safeSuccessUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}';

        const session = await stripeForm(secret, '/checkout/sessions', {
          mode: 'payment',
          success_url: success,
          cancel_url: safeCancelUrl,
          client_reference_id: linkId || undefined,
          'payment_method_types[0]': 'card',
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': currency,
          'line_items[0][price_data][unit_amount]': String(unitAmount),
          'line_items[0][price_data][product_data][name]': productName.slice(0, 120),
          'line_items[0][price_data][product_data][description]': description.slice(0, 200) || undefined,
          'payment_method_options[card][request_three_d_secure]': 'any',
          'payment_intent_data[metadata][linkId]': linkId || undefined,
          'payment_intent_data[metadata][hotel]': hotel || undefined,
          'payment_intent_data[metadata][guest]': guest || undefined,
          'metadata[linkId]': linkId || undefined,
          'metadata[hotel]': hotel || undefined,
          'metadata[guest]': guest || undefined,
          'metadata[ref]': ref || undefined,
        }, { stripeAccount });

        return json({
          ok: true,
          id: session.id,
          url: session.url,
          paymentIntent: session.payment_intent || null,
          mode: session.mode,
          livemode: !!session.livemode,
          stripeAccount: stripeAccount || null,
          hotelOwned: !!input.secret,
        }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/api/collect') {
        const input = await request.json().catch(() => ({}));
        const secret = String(input.secret || env.STRIPE_SECRET_KEY || '').trim();
        if (!secret) throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { status: 400 });
        const stripeAccount = String(input.stripeAccount || '').trim() || undefined;
        const out = await createCollect(secret, input, stripeAccount);
        return json(out, 200, cors);
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/invoice/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/invoice/'.length));
        if (!id) return json({ ok: false, error: 'missing invoice id' }, 400, cors);
        const secret = String(request.headers.get('X-Maha-Stripe-Secret') || env.STRIPE_SECRET_KEY || '').trim();
        if (!secret) throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { status: 400 });
        const stripeAccount = String(request.headers.get('Stripe-Account') || '').trim() || undefined;
        const inv = await stripeGet(secret, '/invoices/' + encodeURIComponent(id) + '?expand[]=payment_intent', { stripeAccount });
        return json({
          ok: true,
          id: inv.id,
          status: inv.status,
          paid: inv.status === 'paid',
          url: inv.hosted_invoice_url || '',
          number: inv.number || '',
          customerEmail: inv.customer_email || '',
          amountDue: inv.amount_due,
          currency: inv.currency,
          livemode: !!inv.livemode,
        }, 200, cors);
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/session/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/session/'.length));
        if (!id) return json({ ok: false, error: 'missing session id' }, 400, cors);
        const secret = String(request.headers.get('X-Maha-Stripe-Secret') || env.STRIPE_SECRET_KEY || '').trim();
        if (!secret) throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { status: 400 });
        const stripeAccount = String(request.headers.get('Stripe-Account') || '').trim() || undefined;
        const session = await stripeGet(
          secret,
          '/checkout/sessions/' + encodeURIComponent(id)
            + '?expand[]=payment_intent&expand[]=payment_intent.payment_method',
          { stripeAccount }
        );
        const paid = session.payment_status === 'paid' || session.status === 'complete';
        return json({
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
        }, 200, cors);
      }

      return json({ ok: false, error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ ok: false, error: e.message || String(e) }, e.status && e.status < 500 ? e.status : 500, cors);
    }
  },
};
