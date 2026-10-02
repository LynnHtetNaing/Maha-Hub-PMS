# Maha Booking Engine — Google Hotel connectivity foundation

Status: technical foundation only. **Not live on Google.** Maha is **not** a Google Connectivity Partner. No Hotel Center credentials are stored in this repo. Feeds can be generated and validated locally; Google will not show Maha booking links until Padauk completes Google’s partner process.

Checked: 2 October 2026.

## What this build is

1. A guest-facing **Maha Booking Engine** at `/book/` with deep links (`hotel`, `checkin`, `checkout`, `adults`, `children`).
2. A **public catalog** derived from Maha Hub (no guest names, cards, or folios).
3. Generators for Google-format files:
   - Hotel List XML
   - Landing Pages (`PointsOfSale`) XML
   - ARI sample messages: Transaction (property data), RateAmount, Avail, InvCount
4. A provider **Distribution** screen in Maha Hub to fill Google metadata, publish the catalog, and download feeds.
5. Honest readiness checks. The UI never claims “live on Google” or “approved.”

## What this build is not

- Not a push to `google.com/travel/hotels/uploads/*`
- Not Hotel Center access, certification, or price-accuracy scoring
- Not a fake mock branded as production Google connectivity
- Not payment-gateway checkout (request / hold for hotel confirmation only in v1)

## Partner path (outside code)

Either:

- Apply to become a **Google Connectivity Partner**, or
- Connect hotels through an **existing** Connectivity Partner (channel manager / IBE already on Google’s directory)

Code alone cannot complete either path.

## Order after this foundation

1. Stable public HTTPS host for landing pages and feed pull URLs
2. Google interest form + business verification
3. Hotel Center account (if invited)
4. Upload hotel list, match Maps listings, upload landing pages
5. ARI push with Google-issued partner key + IP allowlist
6. Price-accuracy certification
7. Optional online payment before auto-confirm
