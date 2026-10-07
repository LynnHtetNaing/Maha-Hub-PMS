/**
 * Minimal maha-hub-pms Worker entry (when Builds root = workers/maha-hub-pms).
 * Prefer repo-root wrangler.toml [assets] for serving the full Hub.
 */
export default {
  async fetch() {
    return new Response(
      JSON.stringify({
        ok: true,
        worker: 'maha-hub-pms',
        hint: 'Deploy from repo root with wrangler.toml [assets] to serve the Hub UI.',
      }),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  },
};
