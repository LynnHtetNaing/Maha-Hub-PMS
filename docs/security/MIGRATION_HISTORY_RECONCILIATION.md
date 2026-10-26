> **Naming correction (owner records, 2026-10-22):** this file labels `wragaoglvksbbgmfjyzp` "development/test" and `ulguzclaeksxfhzwuovg` "production". The owner's records say the opposite: `wragao...` is **LIVE** and `ulguz...` is **STAGING**. Read this file with that swap. See `SECURITY_STATUS.md`.

# Maha PMS Migration-History Reconciliation Plan

Date: 2026-10-22

## Stop condition

**Do not run `supabase db push`, reset, rebase, or automated production deployment until this reconciliation is completed and reviewed.** The connected Supabase migration tool records generated versions that differ across development/test and production. Repository migration files use their own timestamp prefixes. The schema changes are present, but migration history must be aligned so a future CLI deployment does not replay them.

## Confirmed mappings

| Repository migration file | Development/test recorded version | Production recorded version | Notes |
|---|---|---|---|
| `20261021120000_contain_legacy_edc_rpc.sql` | `20261021111456` (`20261021_015_contain_legacy_edc_rpc`) | Not applied / no legacy EDC table or named functions found | Dev/test only |
| `20261021121000_fix_org_member_select_policy.sql` | `20261021111648` (`20261021_016_fix_org_member_select_policy`) | `20261022030433` (`fix_org_member_select_policy`) | Applied to both |
| `20261022130000_require_org_admin_for_org_updates.sql` | `20261022023616` | `20261022030436` | Applied to both |
| `20261022143000_bound_invoice_and_counter_floors.sql` | `20261022024549` | `20261022030504` | Applied to both |
| `20261022150000_harden_nested_secret_payload_detection.sql` | `20261022024953` | `20261022030506` | Applied to both, then corrected below |
| `20261022160000_prevent_org_owner_transfer.sql` | `20261022030216` | `20261022030440` | Applied to both |
| `20261022170000_allow_empty_secret_placeholder.sql` | `20261022030757` | `20261022030800` | Applied to both |

The migration `20261021123000_contain_public_edc_lookup.sql` was applied to development/test through direct SQL tooling but did not appear in the returned migration history list. Confirm the actual function grants and then reconcile that file's history entry as part of the same reviewed procedure. Production had no legacy EDC lookup function, so do not apply that migration to production.

## Required reconciliation procedure

1. Confirm the working tree and exact local migration filenames using the Supabase CLI. Do not run `db push`.
2. Fetch and archive the full migration history from both projects.
3. Verify each mapped schema change is present using the read-only structural checks in the security audit.
4. Use the current Supabase CLI's documented `migration repair` workflow to mark the repository migration versions as already applied in each project where the matching change is confirmed. Do not manually insert or delete rows in Supabase's internal migration table.
5. Handle the development-only EDC lookup migration separately; do not mark it applied in production because the function is absent there.
6. Run `supabase migration list` and compare local/remote histories for each project. Only after the mismatch is resolved should a reviewed, non-production dry run or equivalent validation occur.
7. Preserve the corrected empty-secret-placeholder migration. The first secret-detector migration's behavior was corrected by the subsequent migration; both are part of the historical sequence and should not be squashed without an explicit plan.

## Why this matters

A migration can be correctly applied to the database while still being absent under its repository filename version in migration history. A later CLI push may attempt to replay it. The invoice-floor migration intentionally fails if it cannot find the expected pre-change guard, so replay should stop rather than silently patch the function again. This is a release-engineering risk; it does not mean the verified schema fixes are absent.
