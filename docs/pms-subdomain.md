# PMS on its own address: pms.maha-hub.com

Status: the code is ready and switched OFF. Nothing changes for anyone until the launch steps below.

What it does
- pms.maha-hub.com opens straight onto the PMS sign-in. It has its own sign-in and its own saved data, apart from the other systems.
- maha-hub.com keeps the website, the Main page (/solutions) and the other systems (Sales and so on).
- Old PMS addresses (/solutions-PMS, /ecosystem/PMS) on maha-hub.com move to pms.maha-hub.com after launch.

Launch steps (in this order, after maha-hub.com is on Cloudflare)
1. Cloudflare > Workers > maha-hub-pms > Settings > Domains: add the custom domain pms.maha-hub.com. Wait until it shows Active.
2. In wrangler.toml (and workers/maha-hub-pms/wrangler.toml) set PMS_HOST = "pms.maha-hub.com". Merge. Check https://pms.maha-hub.com/ shows the PMS sign-in. Old paths on maha-hub.com still work at this point.
3. Supabase > Authentication > URL configuration: add https://pms.maha-hub.com to the allowed redirect URLs (ask before changing).
4. Stripe worker: CORS_ORIGIN and ALLOWED_RETURN_ORIGINS already list pms.maha-hub.com; redeploy the Stripe worker once.
5. Flip the switch: PMS_SPLIT_ON = true in ecosystem/index.html, PMS_REDIRECT = "1" in the two wrangler.toml files; website and reset-password "Sign in" links point to https://pms.maha-hub.com/; manifest start_url becomes "/". Merge.
6. Phone app users: remove and reinstall once (new address = new app); staff sign in once on the new address.

Rollback: set PMS_REDIRECT = "0", PMS_SPLIT_ON = false and merge; the old addresses work again at once.
