# Maha Reach — concept plan

Status: the screens can be reviewed in `reach/index.html`. A local server, `reach/server.mjs`, can place an approved post on a Buffer queue. The Buffer key stays in the server environment and is not written into the page.
Checked: 1 October 2026.

The review build is a browser walkthrough of the first version. Each hotel’s records stay in that browser. The paid Gemini call is not connected there. A picture and a short video are composed from the hotel’s photo, and the price and dates are drawn on top. Sign in as a drafter, then as the person the provider has allowed to approve, and the two hotels cannot see each other. The Buffer account used by the review server is the owner’s own account. On 1 October 2026 that account had an organization and no connected channel, so nothing can be queued until Facebook or Instagram is connected inside Buffer. LINE is not a Buffer channel.
Maha Reach is its own software. It is not a screen, menu, or add-on inside Maha Hub.

## 1. What it is

Maha Reach is a cloud marketing system for hotels, resorts, hostels, restaurants, and other hospitality businesses.

A hotel signs in from any computer, keeps its own brand, and turns a public offer into approved posts for the places its guests actually look. The first country is Thailand. Languages in the product now are Thai and English. Myanmar is outside this plan until the owner opens it.

The sentence for the product:

**One place for the hotel’s public message.**

## 2. What it is not

- It does not live inside the property system.
- It does not read guest names, phone numbers, passports, reservations, folios, payments, or card data.
- It does not hold the hotel’s advertising budget. The hotel pays Meta, Google, TikTok, and LINE from its own accounts. Maha Reach may later show what those platforms report. That money is never Maha revenue and never a Maha credit.
- It does not ask anyone for a Facebook, Instagram, TikTok, Google, or LINE password. Connection, when a platform allows it, is an official authorization the hotel can revoke.
- It does not pretend every network can be posted to automatically. Several cannot, until the platform approves Maha.

## 3. Honest verdict

A calendar that posts the same caption to Facebook and Instagram is a copy of Buffer, Hootsuite, Metricool, Later, SocialBee, and Publer. Canva already makes the pictures. Those tools are the commodity.

Maha Reach is a different product only if the first useful act is this:

A hotel enters a public offer — room or table, price or discount, dates, booking or ordering link, language, and brand voice — and Maha Reach produces an approved set of platform-ready messages, with a credit cost shown before anything is generated.

The hospitality edge is the offer, the approval, the languages, and LINE. It is not “we also have a calendar.”

## 4. Modules

| Module | What the hotel does there |
| --- | --- |
| Home | What is waiting for approval, what is scheduled, what failed |
| Offers | The public fact: room or dish, price, dates, link, languages |
| Studio | Drafts, captions, pictures, short videos, brand voice |
| Calendar | Draft, approved, scheduled, posted, failed |
| Accounts | Connected pages and the status of each connection |
| Brand | Logo, colors, voice, languages, do-not-say rules |
| Library | Photos and files the hotel is allowed to use |
| Credits | Balance, what each action costs, history |
| Team | Who may draft, who may approve, who may connect an account |
| Ads | Later. Read-only performance first. Creating ads is a later phase |
| Results | Later. Numbers the platform reported, kept separate from numbers Maha calculated |

## 5. What a hotel can safely give it

Allowed, because it is already public or the hotel typed it for marketing:

- Property name, city, address, phone, website
- Room or outlet names and public descriptions
- A public rate or a promotion the hotel chooses to advertise
- Dates of the offer
- Booking or ordering link
- Amenities, restaurant notes, events
- Photos the hotel uploads or marks as public

Refused, even if someone pastes them in:

- Guest identity, stay history, folio, invoice, payment, card
- Staff passwords
- Another hotel’s data

Maha Hub is not required for the first version. A person can type the offer. A later, separate link may copy only the allowed fields. That link is a later decision. It is not part of building Maha Reach’s first version.

## 6. Platform feasibility

Checked against official developer pages on 1 October 2026. “While waiting” is what the product does before approval arrives.

| Platform | Class | What is actually allowed | While waiting |
| --- | --- | --- | --- |
| Facebook Page | Yellow | A Page post can be published with a Page token and `pages_manage_posts`, by someone allowed to create content on that Page. Scheduling on Facebook itself must be between 10 minutes and 30 days out. Serving other hotels needs Meta App Review and business verification. Sources: [Pages posts](https://developers.facebook.com/docs/pages-api/posts/), [Page feed](https://developers.facebook.com/docs/graph-api/reference/page/feed/), [Business verification](https://developers.facebook.com/docs/development/release/business-verification/). | Preview, copy, and “mark as posted.” |
| Instagram professional | Yellow | Images, video, Reels, and carousels can be published to a professional account. The newer content-publishing guide (updated 30 June 2026) states 100 API-published posts in a rolling 24 hours. An older reference page still says 50; treat 100 as current and re-check before launch. Accounts the app does not own need Advanced Access, App Review, and business verification. Sources: [Content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/), [Overview](https://developers.facebook.com/docs/instagram-platform/overview), [App Review](https://developers.facebook.com/docs/instagram-platform/app-review/). | Same preview path. Personal Instagram accounts cannot be posted to by the API. |
| LINE Official Account | Yellow | Messaging API can broadcast, push, and narrowcast. Those sends count toward the hotel’s LINE plan. Reply messages do not. One request to five people counts as five, not as five times the number of bubbles. Thailand prices on LINE’s own pages, checked 1 October 2026: Free 300 broadcast messages; Basic 1,280 baht for 15,000; Pro 1,780 baht for 35,000; extra messages 0.10 and 0.06 baht. An older LINE help article still says 500 on the free plan. Confirm inside the hotel’s LINE manager before promising a number. The hotel pays LINE, not Maha. Sources: [Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/), [How counts work, 28 May 2026](https://developers.line.biz/en/tips/2026/05/28/how-to-count-messages/), [LINE for Business Thailand broadcast table](https://lineforbusiness.com/th/service/line-oa-features/broadcast-message), [TH help center, 300](https://help2.line.me/official_account_th/ios/categoryId/20006366/pc?lang=en). | Write the message and show the hotel the LINE cost before a send exists. |
| Google Business Profile | Yellow | Local posts still exist on the v4 localPosts method, including offers and events. The API is closed until Google approves the Cloud project. The FAQ says requests are reviewed within 14 days. Default quota after approval was not re-checked as a number in this pass. Sources: [FAQ](https://developers.google.com/my-business/content/faq), [Create a local post](https://developers.google.com/my-business/content/posts-data). | Offer text and a photo, ready to paste. |
| YouTube | Yellow | `videos.insert` works. Projects created after 28 July 2020 that have not passed YouTube’s audit can only upload private videos. Default quota includes 100 upload calls a day in the video-uploads bucket, and 10,000 units a day for other calls. The old “about 1,600 units per upload” figure is not what the current insert page says; it now says 1 unit in the uploads bucket and a cap of 100 upload calls a day. Sources: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [Quota and audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits). | Script and thumbnail. Public upload waits for the audit. |
| Meta Ads | Red for the first version | Managing another business’s ad account needs Advanced Access, business verification, and a real use of the Marketing API. Standard access is only enough for an ad account the app owner itself controls. Source: [Authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/). | Do not create ads in the first version. |
| Google Ads | Red for the first version | A developer token starts at Explorer or Test. Basic access is 15,000 operations a day and the review is typically 5 business days. Standard is higher and can take about 10 business days, and it brings Required Minimum Functionality rules. The API itself has no per-call fee. The hotel’s ad spend is still paid to Google by the hotel. Sources: [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [Developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token). | Do not create campaigns in the first version. |
| TikTok posting | Red until audited | Unaudited clients may post only to private accounts, only as private (`SELF_ONLY`), and only for 5 users in 24 hours. Public posting needs TikTok’s audit. A creator is also capped, often around 15 API posts a day. Sources: [Content sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post). | Script and cover. No public auto-post. |
| TikTok Ads | Red | Not re-checked against the full Marketing API reference in this pass. Treat as closed until a later research note cites the current official page. | Out of the first two phases. |
| LinkedIn | Yellow, later | Not re-checked in this pass. Useful for some hotels, not for the first version. | Out of the first version. |
| Pinterest | Yellow, later | Not re-checked in this pass. | Out of the first version. |
| Email | Yellow, later | Send through a mail provider the hotel or Maha pays. Do not build a mail server. The provider is an open choice. | Out of the first version. |
| The hotel’s own website or blog | Green as an export | Maha Reach can produce the article. Publishing onto the hotel’s site depends on that site. A file or a copy is always possible. | Export the article. |

## 7. Build, buy, or wait

Build ourselves:

- Accounts, hotels, roles, and the audit trail
- Offers, brand, drafts, versions, approval
- The calendar as a record, even before a network accepts the post
- The credit ledger and the margin record
- The rule that strips guest and payment data if a later import exists

Use official platform APIs, after approval, for publishing and for reading results. Do not scrape.

Buy or rent, and keep the choice replaceable:

- The model that writes, draws, and makes the short video. One paid Google Gemini account covers all three. Maha Reach calls an internal gateway. The hotel never sees the provider key. The model name can change without rewriting the product.
- File storage for images and video.
- Email delivery, when that phase starts.
- A multi-network posting service is optional later, and only if its cost per hotel stays understandable. It is not the core. If Maha Reach is only a skin on someone else’s scheduler, the hospitality difference disappears and the exit becomes hard.

Wait:

- Creating Meta, Google, or TikTok ads
- Automatic public TikTok and public YouTube
- Any feature that needs a guest list

## 8. Shape of the system

Maha Reach has its own sign-in. The server holds the records. A new browser loads the hotel after sign-in. The browser is not the source of truth.

One hotel cannot read another hotel. A drafter can write. A manager approves and connects accounts. A Maha operator can open a hotel only with a second step and a recorded reason.

Tokens for Facebook, Instagram, LINE, and later networks are encrypted on the server. The browser receives “connected as Page name,” never the token.

A scheduled post is a job. A worker claims one job at a time. If the platform is not approved yet, the job stops in “ready to copy” instead of pretending it was published.

Credits use the starter setting below. The ledger still has a dated price list, a wallet per hotel, and rows that are only added: grant, consume, refund, expire, adjust. The same request key cannot charge twice. A failed job refunds once, and never more than it consumed. Each AI call stores the provider cost so the margin can be checked later.

### How to set credits

Checked 1 October 2026.

Text is cheap. Pictures are not. Buffer includes unlimited caption help on every plan, including the free plan, and charges per connected channel instead (Essentials about $6 per channel per month on its pricing page). Canva puts text and pictures in one monthly allowance, and a picture uses more of it: the Canva help page says Pro is about 200 premium picture-level uses a month, or about 2,000 ordinary text-level uses, from the same pool. Later sells credits and spends one credit on a caption.

OpenAI’s own price page lists GPT-4.1 mini at $0.40 per million input tokens and $1.60 per million output tokens. A hotel caption is a fraction of one US cent. Google’s picture and video prices, checked 1 October 2026, are the ones this plan uses, because the caption, the picture, and the short video come from the same paid account. A default picture is about 3.4 US cents. A sharper picture is about 6.7 US cents. Eight seconds of video is about 80 US cents, roughly twenty-four default pictures.

Starter weights, which the provider can change later without rewriting the product:

| Action | Credits |
| --- | --- |
| One caption, one hashtag set, or one translation | 1 |
| One default picture | 10 |
| One sharper picture | 20 |
| One 4-second vertical video | 120 |
| One 8-second vertical video | 240 |
| Save, approve, copy, schedule, or mark as posted | 0 |

Each hotel receives **300 credits on the first day of the month**. Unused monthly credits expire. That is enough for about twelve posts, each with a Thai caption, an English caption, and one default picture, plus a few regenerations. Doing the picture again costs another 10. Doing the caption again costs another 1. One eight-second video is 240 of those credits, so the screen asks for a clear confirmation and shows what will be left.

An extra pack is another 300 credits, bought when the month runs out. Those last 90 days. Do not set the baht price of the pack until one real month of provider bills exists. The rule then is: the baht charged for 300 credits is at least four times what those credits cost in model fees the month before. The monthly subscription is a separate decision. It pays for the software. The credits pay for the model.

The screen says the cost before the button runs: “This picture uses 10 credits. 240 remain.” A video says the same with its own number. If the balance is too low, the button does not run and nothing is consumed. A failed call is refunded.

Sources: [Buffer pricing](https://buffer.com/pricing), [Canva AI allowance](https://www.canva.com/help/ai-access/), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

### Pictures and short video

Checked 1 October 2026.

The integration is the paid Google Gemini API. One key and one bill cover the caption, the picture, and the short video. The key stays on Maha Reach’s server. The paid tier is required. On that tier Google does not use the prompts or the results to improve its products. The free tier does, so Maha Reach does not call it.

The hotel sees “picture” and “short video,” plus the credit cost. The model name sits in the gateway. If Google retires a model, the gateway and the dated credit row change. The hotel screens stay the same.

| Job | Model | Provider cost behind the credits |
| --- | --- | --- |
| Default picture, about 1024px | `gemini-3.1-flash-lite-image` | $0.0336, charged as 10 credits |
| Sharper picture, about 1024px | `gemini-3.1-flash-image` | $0.067, charged as 20 credits |
| 4-second vertical video, 720p | `gemini-omni-1.1-flash` | about $0.40, charged as 120 credits |
| 8-second vertical video, 720p | `gemini-omni-1.1-flash` | about $0.80, charged as 240 credits |

Google states the video rate as about $0.10 per second at 720p (5,792 output tokens per second at $17.50 per million video tokens). The first video shape stays at 720p so that rate remains the one on the screen. A higher resolution waits until Google publishes a rate for it and the credit row is updated.

The picture starts from a photo the hotel uploaded, when one exists. A picture made with no hotel photo is allowed, and the preview says it was made by AI. The short video starts from the hotel’s photo, or from a picture the hotel has already approved. The shape is vertical 9:16, four or eight seconds, because that is what a phone feed uses. Landscape 16:9 can be added later for a website or YouTube export.

Rules that stay with the product:

- The offer’s price, dates, and Thai or English sentence are drawn on top by Maha Reach. They are kept out of the generated pixels, so a wrong discount is a text change and does not spend another picture.
- A guest’s face, or any real person’s likeness, is used only when the hotel already has the right to use that photo.
- The prompt follows the offer. It does not invent a room, a view, or a dish the hotel did not describe.
- The screen states the credits and how many remain, and the hotel confirms, before a picture or a video starts.
- A failed call refunds once.
- Generated video carries Google’s invisible SynthID mark.

Imagen 4 ended on 17 August 2026. Google’s replacement for it is Gemini 3.1 Flash Image. The current Veo 3.1 preview models, including the cheaper Lite tier, are scheduled to end as early as 22 October 2026. Google’s own video guide names Gemini Omni Flash as the default video model, and that model has no shutdown date announced. OpenAI’s Videos API and Sora 2 ended on 24 September 2026, and the deprecation table lists no replacement. OpenAI still sells pictures. Maha Reach uses one vendor so the hotel has one bill for the picture and the video.

Sources: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [Video guide](https://ai.google.dev/gemini-api/docs/video), [Gemini Omni Flash](https://ai.google.dev/gemini-api/docs/omni), [Gemini API terms](https://ai.google.dev/gemini-api/terms), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

Advertising spend, if it is ever imported, lives in its own table. No function may move it into the wallet.

## 9. Versions

### First version

The hotel can sign in, set the brand, enter one offer, and receive Thai and English drafts, a picture, and a short video. Approval works the same way Maha Hub allows a person: the provider turns that permission on for the people who may approve. Anyone without it can draft only. The provider can approve. The screen shows a Facebook version, an Instagram version, and a LINE version, including the picture and the video in the preview. Credits follow the starter table in section 8. Copy and “mark as posted” stay available. An approved Facebook or Instagram caption can also join a Buffer queue, which uses 0 credits. Buffer then publishes it on that channel’s next open time, or at a chosen time. The browser never sees the Buffer key. LINE stays copy or mark as posted, because Buffer does not send LINE, and a LINE send remains the hotel’s own bill. Other hotels are not added to this personal Buffer key. A later hotel connects through Buffer’s own sign-in. Making the video file is part of this version. Public upload to YouTube or TikTok is not.

### Second version

Instagram publishing after Meta approval. LINE send, with the hotel’s LINE fee shown before the send. Google Business post after Google approves the project. A calendar. Results that the platform itself reported, labeled as such. A hand-entered public offer can be replaced by a typed import of public hotel fields. Still no guest data. Still no ad creation.

### Third version

YouTube after audit. TikTok after audit. Read-only ad performance from accounts the hotel already runs. Only then, and only if the approvals exist, creating a simple ad. Email. A narrow public-data link from Maha Hub, still a separate product. Myanmar is not part of this version.

## 10. Risks

| Risk | What to do |
| --- | --- |
| Meta, Google, TikTok, or YouTube reject or delay the app | The first version is useful without them |
| A hotel expects a personal Instagram or a private TikTok to post publicly | The screen says so before they connect |
| Guest data is pasted into a prompt | The offer form has no guest fields, and an import strips unknown keys |
| Ad spend is mistaken for Maha income | Separate tables, separate words on screen, a test that spend cannot enter the wallet |
| LINE message fees surprise the hotel | Show the count and whose bill it is before any send |
| Credit prices are guessed in code | Prices exist only as dated rows the owner can change |
| Thai privacy law | Marketing uses public property facts and the hotel’s own subscribers. No guest list leaves the property system. Consent for LINE and email stays with the account the hotel already runs |
| Building a scheduler nobody asked to differentiate | Do not start with ten networks. Start with the offer |
| A generated picture invents a room or uses a guest’s face | Start from the hotel’s own photo. The prompt follows the offer. A likeness needs a right the hotel already holds. A fully generated picture is labeled as made by AI |
| One video spends most of the month’s credits | The screen shows 120 or 240 credits and the balance that will remain, and waits for confirmation |

## 11. What to open with the platforms when building starts

These reviews take weeks. They are not part of this plan, and they should start only when the owner says the build has started.

1. Meta business verification and App Review for Page posting and Instagram publishing
2. LINE Messaging API channel for a test Official Account
3. Google Business Profile API access request
4. YouTube API audit, only when public YouTube upload is in scope. Making the video file does not require it
5. Google Ads developer token, only when ads are in scope
6. TikTok audit, only when public TikTok posting is in scope

## 12. Owner decisions

Decided on 1 October 2026:

1. Thailand first.
2. Thai and English. Myanmar stays out until the owner asks.
3. Approval is a permission the provider gives to a person, the same way the provider allows a user in Maha Hub. People without that permission draft only. The provider can approve.
4. Pictures and short video use one paid Google Gemini account. The default picture is Gemini 3.1 Flash Lite Image (10 credits). The sharper picture is Gemini 3.1 Flash Image (20 credits). The short video is Gemini Omni Flash, from the hotel’s photo, vertical, 720p, at 120 credits for 4 seconds and 240 credits for 8 seconds.

Still open:

1. Does the first version include a LINE preview, or only Facebook and Instagram?
2. Does the hotel’s own staff draft, or do Maha staff draft for them?
3. The baht price of the monthly subscription, and the baht price of an extra credit pack. The credit weights above are the starter. The baht amounts wait for the owner.

## 13. Order of work, after this plan is approved

1. Sign-in, one hotel, roles, audit
2. Brand, offer, draft, picture, short video, approval
3. Credit wallet and ledger using the starter weights. Baht prices stay unset
4. Platform previews and “mark as posted”
5. Submit the Meta review using that working preview
6. Turn on real Facebook posting for hotels that pass
7. Then the second version in the order above

No screen from this list is part of Maha Hub.
