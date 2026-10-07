/** Maha Hub Worker — serves static Hub via Assets binding. */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
