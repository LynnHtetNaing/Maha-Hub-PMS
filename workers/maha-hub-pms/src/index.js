/** Minimal maha-hub-pms Worker for Cloudflare Builds health. */
export default {
  async fetch() {
    return new Response('Maha Hub Worker OK', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
