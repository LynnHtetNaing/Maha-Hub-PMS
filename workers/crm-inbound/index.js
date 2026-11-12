/* Cloudflare Email Worker: a hotel writes back to crm@maha-hub.com.
   The mail is passed to the Supabase function crm-inbound (the CRM lists it under Enewletter > Replies) AND forwarded to the usual mailbox, so nothing is lost.
   Set up (once): Cloudflare > Email > Email Routing > Routing rules: the address crm@maha-hub.com -> "Send to a Worker" -> crm-inbound.
   Variables (wrangler.toml): FUNCTION_URL, FORWARD_TO (a verified destination address). Secret: INBOUND_SECRET (`npx wrangler secret put INBOUND_SECRET`,
   the same long random text as the Supabase secret of the same name; never put it in a file). */
export default {
  async email(message, env, ctx) {
    const MAX = 3_500_000;
    try {
      if (message.rawSize && message.rawSize <= MAX && env.FUNCTION_URL && env.INBOUND_SECRET) {
        const raw = await new Response(message.raw).arrayBuffer();
        ctx.waitUntil(fetch(env.FUNCTION_URL, { method: 'POST', headers: { 'x-inbound-secret': env.INBOUND_SECRET, 'content-type': 'message/rfc822' }, body: raw }).catch(() => {}));
      }
    } catch { /* the mail is still forwarded below */ }
    if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
  },
};
