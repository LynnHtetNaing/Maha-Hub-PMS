# Cloud-first staff login (staging only until the test matrix passes)

Status: implemented locally, **NOT executed or verified**. `MAHA_AUTH_CONFIG.enabled` stays `false`.

## Login order (`MahaAuth.staffSignIn`)
1. `username-auth` -> Supabase session (invalid -> "username or password is not correct").
2. `maha_properties` (RLS) -> property codes the SERVER says this account may open.
3. `tenant-cloud` `load` per code. Outcomes:
   - cloud payload present and valid and contains this user -> merged into this device -> enter.
   - **no cloud copy yet** -> only if this device already has the hotel + user, and only after an
     explicit confirm. First save then uses `expected_version=0`, which the server accepts only
     while the row is still empty.
   - **load failed** -> sign-in stops. Never falls back to local data.
   - payload unreadable -> sign-in stops, nothing changed.
4. Saves: `expected_version` per property (sessionStorage `maha.tcv.<CODE>`). A tab that never
   loaded a property cannot save it. HTTP 409 pauses saving and asks the user whether to load the
   newer cloud copy; the cloud is never overwritten with stale data.

## What changed in the payload
Cloud row = `{format:"maha-tenant-v1", property_code, hotel}`: one hotel only. Provider accounts,
other hotels, card vault, `session`, `pan/cvc/cvv`, Stripe secret and staff `hash/salt/mfa` are removed.

## Rollout order (staging project ulguzclaeksxfhzwuovg ONLY; never wragaoglvksbbgmfjyzp)
1. Apply migration `20261009_004_*` (aborts if duplicate/malformed codes exist).
2. Diff `supabase/functions/tenant-cloud/index.ts` against deployed v5, then deploy
   `tenant-cloud` (verify_jwt=true) and `platform-admin-provision` (verify_jwt=true).
3. Provision one test org/property/staff through `platform-admin-provision` as the platform admin.
4. Open the staging page with `?auth=supabase` (non-live hosts only).

## Test matrix (all must pass before any PR merge or live enablement)
- invalid username / wrong password
- valid account without membership (unlinked)
- account that must not see another property (try its code -> 403 -> not entered)
- first login, empty browser storage, cloud empty -> confirm prompt; Cancel leaves cloud empty
- first login, empty storage, cloud populated -> data loads, PMS opens
- save -> version increments; reload tab -> state persists
- second browser: save in A, then save in B with old version -> 409 -> prompt, A's data intact
- cloud unavailable (block function) -> sign-in stops, local data untouched
- provisioning: duplicate code, duplicate username, existing email -> no orphan rows/users

## Known gaps / not done
- No automated browser tests exist; the JS changes were reviewed by reading only.
- Provider (Padauk) login still uses the local seed account in `seedDB()` with a hard-coded
  password. Unchanged here; remove it before the live site relies on cloud data.
- Seed demo hotels `PAD01` / `MHY01` exist on any empty device. `MHY01` matches the legacy
  hotel code; the confirm prompt exists to prevent demo data becoming a real cloud copy.
- Verified export/backup + rollback before first real sync is not built yet.
- `redirectTo https://maha-hub.com/reset-password` has no page in this repo.
- Supabase security/performance advisors not reviewed.
