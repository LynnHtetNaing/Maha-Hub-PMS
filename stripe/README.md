# Maha Hub — Stripe Checkout (3D Secure)

Guests get a **real** 3D Secure challenge only when Stripe runs Checkout.

| Mode | What the guest sees |
|------|---------------------|
| **Test** (`sk_test_…`) | Stripe’s test authentication page (Approve / Fail). No bank SMS. |
| **Live** (`sk_live_…`) | Issuer OTP / banking app (true 3DS). |

Manual EDC card-collect (no Stripe) **cannot** send a bank OTP.

## Setup

1. Open [Stripe test API keys](https://dashboard.stripe.com/test/apikeys).
2. Put the secret in `stripe/.env` (gitignored):
   ```bash
   STRIPE_SECRET_KEY=sk_test_…
   # optional:
   STRIPE_PUBLISHABLE_KEY=pk_test_…
   ```
   Then start:
   ```bash
   ./stripe/start.sh
   # or: node stripe/server.mjs
   ```
   Default: `http://127.0.0.1:8783`
3. Or paste keys in Hub → Provider → **Stripe payments (3DS)**.
4. In hotel **Billing → Payment / EDC links**, create a link. Hub creates a Checkout Session with `request_three_d_secure=any`.
5. Send the guest the `https://checkout.stripe.com/…` URL.

## Test cards (3DS)

- `4000000000003220` — requires 3DS authentication  
- `4242424242424242` — succeeds (may skip challenge depending on Radar)  
- Any future expiry, any CVC, any billing ZIP  

## Notes

- Stripe **does not** return the full PAN for EDC key-in. Paid links show brand + last4 only.
- Without Stripe keys, Billing still offers the local EDC collect form (no bank OTP).
- **Real money** requires a Stripe account with business verification + bank details completed in the Stripe Dashboard (`charges_enabled`). Maha Hub cannot finish that for you.
- **Per hotel:** Property setup → Payment methods → hotel’s own `sk_`/`pk_`, **or** Connect `acct_…` under the platform secret.
- Hotel Stripe **secrets are not uploaded** to the Cloud database blob.
