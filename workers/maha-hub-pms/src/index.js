/**
 * Maha Hub — Cloudflare Worker (name: maha-hub-pms).
 * Serves the static Hub via Assets; API paths can be added later.
 * Stripe Checkout stays on worker maha-hub-stripe.
 */
export default {
  async fetch(request, env) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('maha-hub-pms worker is up (no ASSETS binding)', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
