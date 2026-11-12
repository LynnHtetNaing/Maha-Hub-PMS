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

## Enewletter templates and answer buttons

- Ten fixed templates plus **Plain** (the free editor). The CEO changes the wording of a template with **Edit template text**.
- The **Event invitation** and the **Gentle reminder** (and a few others) have answer buttons. A hotel clicks, confirms on `crm.maha-hub.com/r/<token>`, and:
  - an event "Yes" makes a **Meeting**, a reminder time makes a **Follow up** for that day;
  - every answer is listed under **Enewletter > Replies** (hotel, choice, message).
- To switch it on: `supabase functions deploy crm-reply --no-verify-jwt` and `supabase functions deploy crm-send-mail --no-verify-jwt`, then deploy the Worker (`npx wrangler deploy`, or the usual Cloudflare deploy) so `/r/*` works. No new database file and no new secret (it uses `MAIL_LINK_SECRET`).
- Written replies are listed too (see "Replies by email" below).

- Templates: every `[type here]` in the text is a box the person fills; the wording stays fixed. The CEO edits the text and the design (the "Design (code)" button) and makes new templates.

## Google Calendar (meetings Busy; a meeting at 9:00 means the next one at 10:30 or later)

Every CRM meeting becomes a **Busy** event in one Google Calendar; a meeting that is deleted, rejected or did not come frees the time again. The CRM asks first when a meeting starts less than 1 hour 30 minutes after the start of another one, and a hotel that picks a taken time in an email is told it is taken. Meetings are 60 minutes, calls 30 minutes (`CAL_MEET_MIN`, `CAL_GAP_MIN` can change this).
It uses a Google **service account**: nobody signs in with Google and no password is stored.

1. Google Cloud Console > create a project > **APIs & Services > Library > Google Calendar API > Enable**.
2. **IAM & Admin > Service Accounts > Create** (name `maha-crm`) > **Keys > Add key > JSON**: a file downloads. Keep it private. **Do not paste it in chat or in a file of the project.**
3. In Google Calendar (the calendar you want to use) > **Settings and sharing > Share with specific people > Add** the service account address (`...@...iam.gserviceaccount.com`) with **Make changes to events**.
4. Supabase > Edge Functions > Secrets (or `supabase secrets set`): `GOOGLE_SA_JSON` = the whole text of the JSON file, `GOOGLE_CALENDAR_ID` = the calendar address (for example your Gmail address; for another calendar: Settings and sharing > Integrate calendar > Calendar ID).
5. Deploy: `supabase functions deploy crm-calendar --no-verify-jwt`, `supabase functions deploy crm-reply --no-verify-jwt`, `supabase functions deploy crm-send-mail --no-verify-jwt`.
Without steps 1-4 the CRM still checks its own meetings for the 1 hour 30 minutes; only the Google part waits.

## Replies by email

A hotel that writes back to `crm@maha-hub.com` appears under **Enewletter > Replies** (who, which hotel, what they wrote). Automatic replies and bounces are skipped, the quoted old mail is cut. The mail still reaches your mailbox.

1. Supabase secret `INBOUND_SECRET` = any long random text (30+ characters). Deploy: `supabase functions deploy crm-inbound --no-verify-jwt`.
2. In `workers/crm-inbound/wrangler.toml` set `FORWARD_TO` to the mailbox that receives the replies now (it must be a verified destination in Cloudflare Email Routing). Then `cd workers/crm-inbound`, `npx wrangler secret put INBOUND_SECRET` (type the same text), `npx wrangler deploy`.
3. Cloudflare > Email > Email Routing > Routing rules: change the rule of `crm@maha-hub.com` from "Send to an email" to **Send to a Worker > crm-inbound**.

## The live calendar a hotel sees (Gentle reminder and Meeting request)

The button "Choose a time" opens a Maha-style calendar at `crm.maha-hub.com/r/...`: the hotel sees the free days and times (Bangkok time), picks one and confirms. The free times come live from your Google Calendar and the CRM Meetings, refresh every 30 seconds, and are checked again when the hotel confirms, so two hotels never get the same time. A chosen time becomes a Meeting (or a Follow up for a call) in the CRM and a Busy event in Google Calendar.
Default opening hours: Monday to Friday, 09:00 to 17:00, a start time every 30 minutes, up to 21 days ahead, at least 24 hours notice, a meeting 60 minutes, a call 30 minutes, and a meeting starts at least 1 hour 30 minutes after the start of another. Change them without code with Supabase secrets: `CAL_HOURS` (for example `10:00-18:00`), `CAL_DAYS` (`1,2,3,4,5,6` = Monday to Saturday), `CAL_STEP`, `CAL_AHEAD`, `CAL_NOTICE_H`, `CAL_MEET_MIN`, `CAL_GAP_MIN`.
Deploy after a change of the function: `supabase functions deploy crm-reply --no-verify-jwt`.

## Booking pages (Talk with the Team, Book a Demo)

- `crm.maha-hub.com/book/talk` - **Talk with the Team**: a 10 minute call (a start every 15 minutes). No email goes to the customer; the call is recorded in the CRM as a Follow up and the time is Busy in Google Calendar.
- `crm.maha-hub.com/book/demo` - **Book a Demo**: 60 minutes. The customer gets a confirmation email (with an Add to Google Calendar button and a calendar file); the demo is a Meeting in the CRM and Busy in Google Calendar.
- The Enewletter "Choose a time" buttons open the same page (Gentle reminder = the 10 minute call; Meeting request = 60 minutes, with the confirmation email).
- Three steps with a loading screen between them: 1 the day (Week or Month view) and the time, 2 the details (first name, last name, email, hotel name, phone, a note, extra guests for a demo), 3 the confirmation.
- A customer who is not in the CRM yet becomes a new hotel record with the status **New Database**. A customer may hold at most two coming bookings.
- Put these two addresses behind your website buttons (Book a Demo, Talk with the Team).
- Deploy: `supabase functions deploy crm-book --no-verify-jwt` (and `crm-reply`), then merge (the Worker serves the pages). The confirmation email uses the same `BREVO_API_KEY` as the Enewletter.

## Google Meet link and time zones (booking pages)

- A demo or meeting booking sends the customer a confirmation email with a **Join with Google Meet** button. Make the link once: https://meet.google.com/landing > **New meeting** > **Create a meeting for later** > copy the link, then add the Supabase secret `MEET_LINK` with it. Every demo uses that room (demos are at least 90 minutes apart, so it is never used twice at once). Without `MEET_LINK` the function asks Google for a Meet link for each event; Google does not always allow this for a personal calendar, so the email may then have no Meet link.
- The page shows the times in the customer's own time zone (the zone line can be switched). The CRM always keeps the Bangkok time; the customer's zone is written in the description of the meeting.
- The page uses the background photo and the font (Inter, with Noto Sans for Thai and Myanmar) of the sign in page.

## The template designer (Enewletter > Edit template / New template, CEO only)

A full-page drag-and-drop designer (GrapesJS, open source, kept in `crm/vendor`, loaded only when it opens). Drag blocks (heading, text, picture, button, hero, offer box, two columns, line) into the mail, click any text to edit it, change colours, sizes and spacing on the right, and check the Laptop and Phone view. It only offers styles the mail keeps, so what you see is what the hotel gets. `[Type here]`, `{{hotel}}` and `{{buttons}}` are buttons on the left. A **Code** button shows and edits the raw design.
- Pictures: add a picture block, then paste a picture address, or upload a file (png, jpeg, gif, webp, up to 3 MB). Uploaded pictures go to the public bucket `crm-images`: run `supabase/migrations/20261113_042_crm_images.sql` (staging first, then live).
- Canva: design in Canva, download the picture (PNG or JPG), and upload it as a Picture block. The text of the mail stays real text.
