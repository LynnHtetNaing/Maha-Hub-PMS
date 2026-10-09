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
