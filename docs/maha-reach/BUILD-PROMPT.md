# Prompt — build Maha Reach later

Use this only after the owner has approved `docs/maha-reach/PLAN.md`.
Until then, do not create an app, a database, or a screen.

## Product

Build **Maha Reach** as a new software system. It is not a module, menu, route, or table inside Maha Hub. Do not edit the Maha Hub property-system files to make Reach work. If this conversation is still inside the Maha Hub repository, stop and ask where the new system should live.

## Read first

Read `docs/maha-reach/PLAN.md`. If a line in this prompt conflicts with that plan, stop and ask.

## First build, and nothing past it

The first build is the first version in the plan:

- Its own sign-in. The server is the source of truth. A new browser shows the hotel after sign-in.
- One hotel cannot read another hotel.
- A drafter writes. Approval is a permission the provider turns on for a person. People without it cannot approve. The provider can approve. Connecting an account is the same kind of permission. A Maha operator needs a second step, and the reason is stored.
- Brand kit: name, voice, languages, logo, colors, words the hotel does not want used.
- An offer: title, what is being sold, public price or discount, dates, link, languages. No guest, reservation, folio, payment, or card fields exist.
- Studio: Thai and English drafts from that offer. No Myanmar. A default picture (10 credits), a sharper picture (20 credits), and a short vertical video from the hotel’s photo (120 credits for 4 seconds, 240 credits for 8 seconds). The gateway calls the paid Google Gemini API only: `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, and `gemini-omni-1.1-flash`, as named in the plan. The provider key stays on the server. Each generation shows the credit cost and the balance that will remain, and waits for confirmation, before it runs. The hotel starts each month with 300 credits. Unused monthly credits expire. A failed generation refunds. Baht prices for a top-up stay unset until the owner sets them. Price, dates, and the Thai or English sentence are overlaid by Maha Reach and are kept out of the generated pixels. A fully generated picture is labeled as made by AI. A guest face or other likeness is used only from a photo the hotel already has the right to use. The prompt follows the offer.
- Approval: an unapproved draft cannot be scheduled or marked ready.
- Previews for a Facebook Page, an Instagram professional account, and a LINE Official Account message.
- Until Meta App Review is approved, publishing means copy and “mark as posted.” Do not fake a published post.
- Credit wallet and an append-only ledger: grant, consume, refund. The same request key charges once. A refund cannot exceed the charge and cannot happen twice. Changing a price later does not rewrite old rows.
- Record the model provider’s cost on each generation so margin can be calculated when a real price exists. Do not invent a baht price for a credit.
- Advertising budget does not exist in this build. Do not create ad accounts, ad campaigns, or a path from spend into the wallet.

## Never in this build

- Guest or payment data, including a pasted import. Unknown keys are dropped and the attempt is recorded.
- Social passwords. Authorization tokens, when a later phase adds them, stay encrypted on the server and are not readable by the browser.
- TikTok public posting, YouTube public posting, Meta Ads, Google Ads, and TikTok Ads. Making a video file for the preview is in this build. Uploading that file to YouTube or TikTok is not.
- The free Gemini tier, Imagen 4, Veo 3.1, and OpenAI Sora. Those are the wrong integration for the reasons in the plan.
- A shared database with Maha Hub.

## Done when

A manager of Hotel A can sign in on a second browser, create an offer, approve the Thai and English drafts, see the credit cost of a picture and of a short video before either one runs, see three previews, and see the credit row. A drafter cannot approve. Hotel B cannot see Hotel A. An attempt to charge the same request twice does not charge twice. A refund a second time fails. A video button with fewer credits than the clip costs does not start and does not charge.

Then stop. Report what was built, what was tested, and the next approval still waiting. Do not continue into live posting unless the owner says that Meta’s approval has arrived.
