import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  STRIPE_SECRET_KEY: 'sk_test_not_a_real_key',
  CORS_ORIGIN: 'https://maha-hub.com',
  ALLOWED_RETURN_ORIGINS: 'https://maha-hub.com',
};

test('rejects an untrusted browser origin', async () => {
  const response = await worker.fetch(new Request('https://stripe.example/api/status', {
    headers: { Origin: 'https://attacker.example' },
  }), env);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('allows and returns only the configured browser origin', async () => {
  const response = await worker.fetch(new Request('https://stripe.example/api/status', {
    headers: { Origin: 'https://maha-hub.com' },
  }), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://maha-hub.com');
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('rejects an off-site checkout return URL before contacting Stripe', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('Unexpected Stripe API request');
  };

  try {
    const response = await worker.fetch(new Request('https://stripe.example/api/checkout', {
      method: 'POST',
      headers: {
        Origin: 'https://maha-hub.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 100,
        currency: 'THB',
        successUrl: 'https://attacker.example/return',
        cancelUrl: 'https://maha-hub.com/cancel',
      }),
    }), env);

    assert.equal(response.status, 400);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects non-finite checkout amounts before contacting Stripe', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('Unexpected Stripe API request');
  };

  try {
    const response = await worker.fetch(new Request('https://stripe.example/api/checkout', {
      method: 'POST',
      headers: {
        Origin: 'https://maha-hub.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 'Infinity',
        currency: 'THB',
        successUrl: 'https://maha-hub.com/success',
        cancelUrl: 'https://maha-hub.com/cancel',
      }),
    }), env);

    assert.equal(response.status, 400);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


/* ---- sign-in gate on money-moving endpoints ---- */
const authEnv = { ...env, REQUIRE_AUTH: '1', SUPABASE_URL: 'https://sb.example', SUPABASE_PUBLISHABLE_KEY: 'pk_test' };
const checkoutBody = JSON.stringify({ amount: 100, currency: 'THB', successUrl: 'https://maha-hub.com/ok', cancelUrl: 'https://maha-hub.com/no' });
const post = (path, headers = {}) => new Request('https://stripe.example' + path, {
  method: 'POST',
  headers: { Origin: 'https://maha-hub.com', 'Content-Type': 'application/json', ...headers },
  body: checkoutBody,
});

async function withFetch(fn, body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push(String(u)); return fn(String(u), o); };
  try { return { result: await body(), calls }; } finally { globalThis.fetch = original; }
}

test('with REQUIRE_AUTH on, checkout without a token is refused and Stripe is never contacted', async () => {
  const { result, calls } = await withFetch(() => { throw new Error('no network expected'); },
    () => worker.fetch(post('/api/checkout'), authEnv));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test('with REQUIRE_AUTH on, /api/collect without a token is refused', async () => {
  const { result, calls } = await withFetch(() => { throw new Error('no network expected'); },
    () => worker.fetch(post('/api/collect'), authEnv));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test('with REQUIRE_AUTH on, a token Supabase rejects is refused and Stripe is never contacted', async () => {
  const { result, calls } = await withFetch((u) => {
    if (u.startsWith('https://sb.example/auth/v1/user')) return new Response('{}', { status: 401 });
    throw new Error('Stripe must not be called');
  }, () => worker.fetch(post('/api/checkout', { Authorization: 'Bearer forged' }), authEnv));
  assert.equal(result.status, 401);
  assert.deepEqual(calls, ['https://sb.example/auth/v1/user']);
});

test('with REQUIRE_AUTH on, a valid user reaches Stripe', async () => {
  const { result, calls } = await withFetch((u) => {
    if (u.startsWith('https://sb.example/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/x', mode: 'payment' }), { status: 200 });
  }, () => worker.fetch(post('/api/checkout', { Authorization: 'Bearer good' }), authEnv));
  assert.equal(result.status, 200);
  assert.ok(calls.some((c) => c.includes('api.stripe.com')));
});

test('with REQUIRE_AUTH on but the sign-in check not configured, it fails closed', async () => {
  const { result } = await withFetch(() => { throw new Error('no network'); },
    () => worker.fetch(post('/api/checkout', { Authorization: 'Bearer x' }), { ...env, REQUIRE_AUTH: '1' }));
  assert.equal(result.status, 500);
  assert.notEqual(result.status, 200);
});

test('with REQUIRE_AUTH off (default), checkout still works without a token', async () => {
  const { result } = await withFetch(() => new Response(JSON.stringify({ id: 'cs_test_2', url: 'https://checkout.stripe.test/y', mode: 'payment' }), { status: 200 }),
    () => worker.fetch(post('/api/checkout'), env));
  assert.equal(result.status, 200);
});

test('guest status lookup stays open (no sign-in) even when REQUIRE_AUTH is on', async () => {
  const { result } = await withFetch(() => new Response(JSON.stringify({ id: 'cs_1', status: 'complete', payment_status: 'paid', metadata: {} }), { status: 200 }),
    () => worker.fetch(new Request('https://stripe.example/api/session/cs_1', { headers: { Origin: 'https://maha-hub.com' } }), authEnv));
  assert.equal(result.status, 200);
});
