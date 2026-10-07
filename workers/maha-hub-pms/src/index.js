/** Maha Hub Worker — serves the static Hub through the Assets binding. */
export default {
  async fetch(request, env) {
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Maha Hub Worker OK', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
