# Maha Reach — concept plan

Status: plan only. Nothing in this paper is built.
Checked: 1 October 2026.
Maha Reach is its own software. It is not a screen, menu, or add-on inside Maha Hub.

## 1. What it is

Maha Reach is a cloud marketing system for hotels, resorts, hostels, restaurants, and other hospitality businesses.

A hotel signs in from any computer, keeps its own brand, and turns a public offer into approved posts for the places its guests actually look. The first markets are Thailand and, when the owner asks, Myanmar.

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
| Studio | Drafts, captions, pictures, short scripts, brand voice |
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

- The model that writes and draws. Maha Reach calls an internal gateway. The hotel never sees the provider key. The provider can change without rewriting the product.
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

Credits:

- A price list with a start date, so a later price does not rewrite history
- A wallet per hotel
- A ledger that only adds rows: grant, consume, refund, expire, adjust
- The same request key cannot charge twice
- A failed job refunds once, and never more than it consumed
- Each AI call also stores the provider cost, so margin can be calculated later
- No prices are decided in this plan. Seed costs are zero until the owner sets them

Advertising spend, if it is ever imported, lives in its own table. No function may move it into the wallet.

## 9. Versions

### First version

The hotel can sign in, set the brand, enter one offer, and receive Thai and English drafts. A manager approves. The screen shows a Facebook version, an Instagram version, and a LINE version. Credits are counted with placeholder costs. Publishing is “copy or mark as posted” until Meta approval exists. If approval arrives during this version, Facebook Page publishing switches on behind the same approval step.

### Second version

Instagram publishing after Meta approval. LINE send, with the hotel’s LINE fee shown before the send. Google Business post after Google approves the project. A calendar. Results that the platform itself reported, labeled as such. A hand-entered public offer can be replaced by a typed import of public hotel fields. Still no guest data. Still no ad creation.

### Third version

YouTube after audit. TikTok after audit. Read-only ad performance from accounts the hotel already runs. Only then, and only if the approvals exist, creating a simple ad. Email. Myanmar language if the owner wants that market in the product. A narrow public-data link from Maha Hub, still a separate product.

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

## 11. What to open with the platforms when building starts

These reviews take weeks. They are not part of this plan, and they should start only when the owner says the build has started.

1. Meta business verification and App Review for Page posting and Instagram publishing
2. LINE Messaging API channel for a test Official Account
3. Google Business Profile API access request
4. YouTube API audit, only when video is actually in scope
5. Google Ads developer token, only when ads are in scope
6. TikTok audit, only when public TikTok posting is in scope

## 12. Decisions only the owner can make

1. Is the first country Thailand only?
2. Does the first version include LINE copy, or only Facebook and Instagram copy?
3. Who may approve: the hotel manager, or also a Maha operator acting for the hotel?
4. Is Maha Reach self-serve, or do Maha staff prepare the drafts?
5. Thai and English first. Is Myanmar in the first version or the third?
6. When credits stop being zero, what is one credit worth? This plan does not set that.

## 13. Order of work, after this plan is approved

1. Sign-in, one hotel, roles, audit
2. Brand, offer, draft, approval
3. Credit wallet and ledger with zero prices
4. Platform previews and “mark as posted”
5. Submit the Meta review using that working preview
6. Turn on real Facebook posting for hotels that pass
7. Then the second version in the order above

No screen from this list is part of Maha Hub.
