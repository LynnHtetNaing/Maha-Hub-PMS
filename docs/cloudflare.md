# Connect Maha Hub GitHub → Cloudflare

## Fix red PR checks (`Workers Builds: maha-hub-pms`)

Every open PR fails the GitHub check **Workers Builds: maha-hub-pms** when Cloudflare
tries to build a Worker that **does not exist on the account** yet:

`Preview creation failed: This Worker does not exist on your account. Script: maha-hub-pms`

Do **one** of these (about 2 minutes). After the Worker exists, re-run checks or push a commit.

### A) Create the Worker in the Dashboard (fastest)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**.
2. **Create** → **Worker** → name it exactly **`maha-hub-pms`** → Deploy (Hello World is fine).
3. Open that Worker → **Settings** → **Builds** (or Connect to Git) → link repo **`LynnHtetNaing/Maha-Hub-PMS`**.
4. Build settings:
   - Production branch: `main`
   - Root directory: `/` (repo root `wrangler.toml` uses `name = "maha-hub-pms"`)
5. Save. Re-run the failed check on any PR (or push an empty commit).

### B) Deploy once with API token

1. Create a Cloudflare API token (Edit Cloudflare Workers).
2. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Merge/deploy this branch, or locally:

```bash
npx wrangler deploy
```

That creates script **`maha-hub-pms`** on the account so PR previews can start.

### C) If you do not want Workers Builds

In Cloudflare → Worker/Git integration for `maha-hub-pms` → disconnect Git.
The red check disappears from PRs (you can still use Pages + the Stripe Worker).

---

## What this repo deploys

| Product | Project | Purpose |
|---------|---------|---------|
| **Cloudflare Worker** | `maha-hub-pms` | Static Hub via Workers Assets — **this is the PR check name** |
| **Cloudflare Pages** | `maha-hub` | Optional Pages project for `maha-hub.com` |
| **Cloudflare Worker** | `maha-hub-stripe` | Stripe Checkout API (`/api/checkout`, `/api/session/…`) |

## Option 1 — Dashboard “Connect to Git”

### Hub Worker (`maha-hub-pms`) — required for green PR checks

Follow **Fix red PR checks** above.

### Pages (optional custom domain)

1. **Create** → **Pages** → **Connect to Git** → **`LynnHtetNaing/Maha-Hub-PMS`**.
2. Production branch: `main` · Build command: *(empty)* · Output directory: `/`.
3. **Custom domains** → `maha-hub.com`.

### Stripe Worker

```bash
cd workers/stripe
npx wrangler login          # or use CLOUDFLARE_API_TOKEN
npx wrangler deploy
npx wrangler secret put STRIPE_SECRET_KEY
```

In Maha Hub → Provider → **Stripe payments**, set helper server to:

`https://maha-hub-stripe.<your-subdomain>.workers.dev`

## Option 2 — GitHub Actions

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
