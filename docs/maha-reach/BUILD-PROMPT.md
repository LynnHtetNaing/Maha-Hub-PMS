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
- A drafter writes. A manager approves and connects accounts. A Maha operator needs a second step, and the reason is stored.
- Brand kit: name, voice, languages, logo, colors, words the hotel does not want used.
- An offer: title, what is being sold, public price or discount, dates, link, languages. No guest, reservation, folio, payment, or card fields exist.
- Studio: Thai and English drafts from that offer. Each generation shows the credit cost before it runs. Prices in the price list may be zero and must be labeled as the owner’s placeholder.
- Approval: an unapproved draft cannot be scheduled or marked ready.
- Previews for a Facebook Page, an Instagram professional account, and a LINE Official Account message.
- Until Meta App Review is approved, publishing means copy and “mark as posted.” Do not fake a published post.
- Credit wallet and an append-only ledger: grant, consume, refund. The same request key charges once. A refund cannot exceed the charge and cannot happen twice. Changing a price later does not rewrite old rows.
- Record the model provider’s cost on each generation so margin can be calculated when a real price exists. Do not invent a baht price for a credit.
- Advertising budget does not exist in this build. Do not create ad accounts, ad campaigns, or a path from spend into the wallet.

## Never in this build

- Guest or payment data, including a pasted import. Unknown keys are dropped and the attempt is recorded.
- Social passwords. Authorization tokens, when a later phase adds them, stay encrypted on the server and are not readable by the browser.
- TikTok public posting, YouTube public posting, Meta Ads, Google Ads, and TikTok Ads.
- A shared database with Maha Hub.

## Done when

A manager of Hotel A can sign in on a second browser, create an offer, approve the Thai and English drafts, see three previews, and see the credit row. A drafter cannot approve. Hotel B cannot see Hotel A. An attempt to charge the same request twice does not charge twice. A refund a second time fails.

Then stop. Report what was built, what was tested, and the next approval still waiting. Do not continue into live posting unless the owner says that Meta’s approval has arrived.
