# Connect Maha Hub GitHub → Cloudflare

This repo can deploy as:

| Product | Project | Purpose |
|---------|---------|---------|
| **Cloudflare Pages** | `maha-hub` | Static Hub (`index.html`, `edc-link/`, icons…) — custom domain `maha-hub.com` |
| **Cloudflare Worker** | `maha-hub-stripe` | Stripe Checkout API (`/api/checkout`, `/api/session/…`) with secret key |

## Option 1 — Dashboard “Connect to Git” (simplest)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**.
2. **Create** → **Pages** → **Connect to Git**.
3. Authorize GitHub and select **`LynnHtetNaing/Maha-Hub-PMS`**.
4. Settings:
   - Production branch: `main`
   - Build command: *(leave empty)*
   - Build output directory: `/`
5. **Save and Deploy**.
6. **Custom domains** → add `maha-hub.com` (matches repo `CNAME`).

### Stripe Worker (dashboard or CLI)

```bash
cd workers/stripe
npx wrangler login          # or use CLOUDFLARE_API_TOKEN
npx wrangler deploy
npx wrangler secret put STRIPE_SECRET_KEY
```

In Maha Hub → Provider → **Stripe payments**, set helper server to:

`https://maha-hub-stripe.<your-subdomain>.workers.dev`

## Option 2 — GitHub Actions (this repo)

1. Cloudflare → **My Profile** → **API Tokens** → Create Token  
   Template **Edit Cloudflare Workers** (includes Pages) or custom with:
   - Account · Cloudflare Pages · Edit  
   - Account · Workers Scripts · Edit  
   - Account · Account Settings · Read  
2. Copy **Account ID** (Workers & Pages overview).
3. GitHub repo → **Settings → Secrets and variables → Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main` (or run workflow **Cloudflare** manually).

Worker Stripe secret is **not** set by the workflow — set once:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --name maha-hub-stripe
```

## Map Stripe helper URL in Hub

Provider → Stripe payments (3DS) → **Stripe helper server**:

`https://maha-hub-stripe.<ACCOUNT>.workers.dev`

Hotel Billing links then call that Worker for Checkout + 3DS.
