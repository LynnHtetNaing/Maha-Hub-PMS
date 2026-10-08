MAHA HUB WEBSITE
================

Upload everything inside the "site" folder to the web root of maha-hub.com
(index.html must sit at https://maha-hub.com/). Keep the existing /ecosystem/ sign-in app as it is.

Pages: index, products, solutions, about, pricing, contact, security, privacy, terms, refund
Also included: sitemap.xml, robots.txt, assets/styles.css, assets/site.js

TO EDIT TEXT, PRODUCTS, PRICES OR COMPANY DETAILS
1. Open website/build.py and change the SETTINGS and PRODUCTS at the top.
2. From the repository root, run:  python3 website/build.py
3. That rewrites the public pages at the root of this repository. Do not overwrite /ecosystem/, /reach/, /connect/, /book/, /edc-link/, /icons/, /brand/, /sw.js, or the Cloudflare worker.

OPERATOR: Padauk Hospitality Technology and Academy (shown in the footer and legal pages).
BEFORE STRIPE REVIEW, FILL IN (build.py > SETTINGS):
- LEGAL_ADDRESS   registered address (currently "[To be added]")
- GOVERNING_LAW   governing law for the Terms of Service (currently "[To be added]")
Until filled, these show highlighted on the Privacy, Terms, Refund pages.

OPTIONAL
- PRICES: add prices per plan (empty = "Contact for pricing").
- Product status: set status to LIVE or DEV for each product.

LIVE HERO (HOME PAGE)
The hero photo changes with the visitor's own local time: sunrise (5-7), daylight (7-17), sunset (17-19), night (19-5).
To preview a look, add ?time=dawn, ?time=day, ?time=dusk or ?time=night to the address.
Live Bagan scene: sun follows real time (rises right 6:00, highest at noon, sets left 18:00), flowing clouds (the photo's own sky billows and drifts),
rippling water, extra Bagan pagodas in the morning mist,
hot-air balloons at sunrise and sunset, and at night lit pagodas, stars reflected in the lake and
floating lotus candles. The art is in hero_art.py; run build.py after editing it.

PRODUCT STATUS (matches the live Maha Hub brief)
Available now: Maha PMS, Maha Connect, Maha Booking, Maha Reach, Maha Sales (each links to /ecosystem/<product>).
Coming soon: Maha HR, Account, Manage, POS, Stock. There is no Maha Revenue product.

DO NOT OVERWRITE THESE PMS PATHS WHEN UPLOADING
/ecosystem/  /reach/  /connect/  /book/  /edc-link/  /icons/  /brand/  /sw.js  and the Cloudflare worker.
The new index.html replaces only the current redirect at https://maha-hub.com/.

CONTACT FORM
The form opens the visitor's email app with the message ready to send to hello@maha-hub.com.
To receive submissions without an email app, connect the form to a form service or your own backend later.

The legal pages are a starting draft. Have them reviewed by a lawyer before relying on them.

ONE-FILE PREVIEW
make_preview.py builds maha-hub-full-site.html: every page in a single file, with all menu items, titles and links working.

MOTION
- Page changes: the current page fades and softly blurs away where you are (no scrolling back up first),
  a fine gold thread runs under the menu, and the new page appears from its top with its title cascading.
- Every click: a soft gold ripple; buttons and cards press in slightly.
- Menu: a gold underline slides to whichever item you point at.
- Product cards: a gold glint follows the pointer.
- Phones and low-power devices get a lighter hero (same motion, without the heavy water and sky filters).
- Visitors who turn on "reduce motion" in their device settings get calm, instant changes.
