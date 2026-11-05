# CRM email: send from crm@maha-hub.com (Brevo)

What it does once it is switched on:

- **Quotation → Send** (in the quotation list of a hotel): the hotel gets an email from `crm@maha-hub.com` with a button that opens the quotation (and the MSA when RevPilot is in it) at `crm.maha-hub.com/d/...`. The hotel presses **Save as PDF** there. The link works for 90 days. The quotation is sent only after the manager approved the discount.
- **Enewletter → Send from the CRM** (CEO only): one message to all hotels in the chosen list, 50 at a time. A **Send test** to your own address comes first. Every email has an unsubscribe link; a hotel that clicked it is skipped next time.
- Everything sent is kept in the table `maha_mail_log` (who sent it, to whom, when, result).
- Until it is switched on, both buttons still work the old way: the message opens in your own email program.

## What you do (in this order)

1. **Brevo account** — brevo.com → sign up (free plan: about 300 emails a day; a longer list needs a paid plan).
2. **Add the domain** — Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain → `maha-hub.com`.
   Brevo shows 3 or 4 DNS records (a `brevo-code` TXT, two DKIM records `brevo1._domainkey` / `brevo2._domainkey`, a DMARC TXT).
   Add them in Cloudflare → DNS → Records. For the CNAME records choose **DNS only** (grey cloud).
   If `maha-hub.com` already has an SPF record (a TXT starting `v=spf1`), do **not** add a second one: add `include:spf.brevo.com` into the existing one.
   Then press **Authenticate** in Brevo.
3. **Sender** — Brevo → Senders → Add a sender → name `Maha Hub`, address `crm@maha-hub.com`.
4. **A place for the replies** — hotels will reply to `crm@maha-hub.com` (or to `MAIL_REPLY_TO` below). Make sure that address receives mail
   (for example Cloudflare → Email → Email Routing → forward `crm@maha-hub.com` to your inbox).
5. **API key** — Brevo → SMTP & API → API keys → Generate a new API key, name it `maha-crm`. **Do not paste it in chat or in a file.**
6. **Secrets** — Supabase → Project → Edge Functions → Secrets (or `supabase secrets set`), add:
   - `BREVO_API_KEY` = the key from step 5
   - `MAIL_LINK_SECRET` = any long random text (30+ characters) — it signs the unsubscribe links
   - optional: `MAIL_REPLY_TO` = the address replies should go to (default `crm@maha-hub.com`)
7. **Database** — run `supabase/migrations/20261106_034_crm_mail.sql` (after 032 and 033), on staging first, then on the main project.
8. **Deploy the function** — `supabase functions deploy crm-send-mail --no-verify-jwt`
   (the function checks the signed-in CRM member itself).
9. **Deploy the Worker** (the `crm.maha-hub.com/d/...` link) — `npx wrangler deploy`.
10. **Test** — Enewletter → write a subject and message → **Send from the CRM** → type your own address → **Send test**.
    Then send a quotation to your own address and open the link.

Only steps 1–6 are yours to do in Brevo, Cloudflare and Supabase; steps 7–9 are the usual deploy and happen only after you say yes.
