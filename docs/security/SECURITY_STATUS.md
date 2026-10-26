# Maha Hub PMS - Security status (plain summary)

Updated 2026-10-22. This page is the owner-approved reading of the ChatGPT security audit
(`SECURITY_READINESS_AUDIT_2026-10-21.md`) and the migration plan
(`MIGRATION_HISTORY_RECONCILIATION.md`). Those two files are kept as the original record.

## Which Supabase project is which (use this, not the audit's labels)

| Project | Ref | Role |
|---|---|---|
| MAHA-HUB Project | `wragaoglvksbbgmfjyzp` | **LIVE** (maha-hub.com sign-in and reset-password point here) |
| Maha-Hub-PMS | `ulguzclaeksxfhzwuovg` | **STAGING / testing only** |

The audit calls `wragao...` "development/test" and `ulguz...` "production". That is the
opposite of the owner's records. Wherever the audit says *development/test* read **LIVE**,
and wherever it says *production* read **STAGING**. Always identify a project by its ref.

## What ChatGPT's security work changed in the databases (SQL, all in `supabase/migrations`)

| Migration | What it does | Applied (per audit) |
|---|---|---|
| `20261021121000_fix_org_member_select_policy` | Members can read their own organization row (old rule compared the wrong columns). | LIVE and STAGING |
| `20261022130000_require_org_admin_for_org_updates` | Organization updates need the MFA-aware org-admin check (owner no longer bypasses it). | LIVE and STAGING |
| `20261022143000_bound_invoice_and_counter_floors` | Invoice and counter start numbers capped at 1,000,000,000 so one user cannot poison numbering. | LIVE and STAGING |
| `20261022150000` and `20261022170000` payload secret detection | Synced hotel data is rejected if it contains card numbers, CVC, sessions, or any non-empty secret key, at any depth. Empty placeholders are allowed. | LIVE and STAGING |
| `20261022160000_prevent_org_owner_transfer` | Nobody can change an organization's owner through the browser. | LIVE and STAGING |
| `20261021120000` and `20261021123000` EDC containment | Switch off the old card-entry (EDC) functions, which stored card number and CVC. | **LIVE only.** STAGING never had those functions. |

Tests for these are in `supabase/tests` (`security_posture.sql`, `tenant_isolation.sql`,
`organization_owner_immutable.sql`, `organization_update_policy.sql`,
`invoice_counter_floor_bounds.sql`, `payload_secret_detection.sql`, `payload_write_rejection.sql`).
They passed using simulated sign-ins inside the database. They are not real API tests.

## Still open (not cleared for commercial launch)

1. Real API tests with separate user sign-ins (owner, org admin, property admin, staff, read-only, inactive user, second hotel).
2. Review of the 20 database functions that signed-in users can call.
3. Supabase Auth dashboard settings: leaked-password protection is OFF, email-code expiry is too long. Done by the owner in the dashboard.
4. The Stripe worker still accepts a Stripe key sent from the browser (`workers/stripe/src/index.js`). Needs a server-side fix.
5. Confirm the EDC flow is really retired on LIVE, then replace it with provider tokenization.
6. Backup and restore drill, monitoring, and a full browser regression test.
7. Migration history must be reconciled before any `supabase db push`. See `MIGRATION_HISTORY_RECONCILIATION.md`.

## Rules for this folder

- Merging these files into GitHub changes **no database**. The SQL was already applied by hand.
- Do not run `supabase db push`, reset, or any automatic deploy against either project.
- Any new database change needs the owner's explicit "yes" first.
- This is not a penetration test, a PCI assessment, or a certification.
