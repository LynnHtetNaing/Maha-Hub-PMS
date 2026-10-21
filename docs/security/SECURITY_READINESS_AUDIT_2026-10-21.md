# Maha PMS Production Security Readiness Audit
Date: 2026-10-21
Scope: read-only review of the connected Supabase project named `Maha-Hub-PMS` (`ulguzclaeksxfhzwuovg`). No production database settings or data were changed during this review.

## Status
**Not yet cleared for commercial production.** This is an initial evidence-based review, not a complete penetration test or certification. Keep the live production deployment unchanged until the high-risk items below are reviewed, tested, and resolved.

## Positive controls observed
- The project has tenant-oriented tables for organizations, properties, memberships, property cloud payloads, and per-property records.
- RLS is enabled on all inspected public tables.
- The tenant-cloud Edge Function requires a bearer token, validates the user with Supabase Auth, uses the caller's JWT (not a service-role client) for tenant data access, and calls property-scoped RPCs.
- The client-facing tables `maha_records` and `maha_property_cloud` have RLS SELECT policies tied to property access; direct client write grants were not observed in the inspected grants. Writes are intended to pass through controlled RPCs.
- Database migrations include tenant identity, username authentication, table-grant hardening, record-level sync, MFA gate, review hardening, and activity logging.
- The username-auth Edge Function uses a server-side service-role client only to resolve the private username mapping, returns generic credential errors, and avoids logging passwords/tokens.
- The inspected SECURITY DEFINER functions do not grant EXECUTE to `anon`. Several high-impact RPCs also have explicit `auth.uid()` checks and property-access/write checks. This is a useful safeguard, but it does not replace per-function review.

## Findings requiring action

### P0 — Review authorization on every exposed SECURITY DEFINER RPC
Supabase's security advisor reports 20 public-schema SECURITY DEFINER functions executable by `authenticated`. This warning does not prove each function is exploitable; some functions correctly check `auth.uid()` and tenant ownership. The read-only function review confirmed that `maha_sync_pull` checks property access and `maha_sync_push` / `maha_save_property_cloud` check property write access. Continue the same review for every exposed function, including helper functions and all invoice/admin functions.

For each function, classify it as:
1. safe for direct authenticated RPC calls, with explicit identity, tenant, and role checks; or
2. internal-only, with EXECUTE revoked from `anon`/`authenticated` and only the required trusted role granted access.

Prioritize data-returning/mutating functions, especially `maha_sync_pull`, `maha_sync_push`, `maha_get_property_cloud`, `maha_save_property_cloud`, invoice-number functions, platform settings functions, recycle-bin functions, and admin/staff management functions. Do not blanket-revoke or switch all functions to SECURITY INVOKER: some are intentionally used by RLS or trusted flows, and careless changes can break access controls or operations.

### P1 — Correctness issue in organization membership SELECT policy
The inspected `maha_organizations_select_member` policy contains an EXISTS predicate comparing `m.organization_id = m.id`. This appears inconsistent with the intended membership relationship and should be reviewed against the migration/source of truth. Do not patch it until the intended owner/admin/member access rules are confirmed and a regression test is prepared.

### P1 — Authentication hardening settings
The Supabase security advisor reports:
- leaked-password protection is disabled;
- email OTP expiry exceeds the recommended one-hour threshold.

Enable leaked-password protection and reduce OTP expiry through the project's Auth settings after verifying recovery/sign-in flows and choosing an appropriate expiry. These settings were not changed by this audit.

### P1 — Verify MFA enforcement end to end
The database includes an MFA-gate migration and the username-auth Edge Function supports an optional emailed sign-in code controlled by `MAHA_REQUIRE_CODE`. The deployed function's comments say the code requirement remains off until the compatible sign-in page is live. Confirm the intended policy for platform administrators and hotel owners, then test enforcement at both login and sensitive server/database operations. A UI-only MFA check is not sufficient.

### P1 — Tenant-isolation acceptance tests
Before live customer onboarding, prove with two separate test users/properties that:
- Hotel A cannot read, update, delete, or sync Hotel B's records or cloud payload by changing property IDs/codes or record keys.
- A staff member cannot reach properties outside their active membership, and read-only staff cannot write.
- Disabled, deleted, or recycled properties/users cannot continue using old sessions to read or mutate data.
- Invoice sequence allocation, settings, audit/activity data, and recycle-bin/admin operations are correctly scoped.
- Anonymous requests cannot access any customer or administrative data.
- A user cannot change their own role, organization ownership, membership, or platform-admin status by direct REST/RPC calls.

These adversarial tests have **not** yet been run. RLS being enabled is not proof that the policies and privileged RPCs are correct.

### P2 — Data/API and frontend architecture
The monolithic HTML file and shared database are maintainability/architecture concerns, not vulnerabilities by themselves. Keep one shared database if tenant isolation is enforced server-side. Add stable routes/deep links after security is validated; routes alone do not enforce authorization. Extract the frontend into modules gradually rather than rewriting everything at once.

### P2 — Production operational controls
Before commercial use, verify backups and restore drills, monitoring/alerts, session revocation behavior, secrets separation, dependency pinning, and a documented incident/restore procedure. Confirm the public frontend contains no service-role/secret key. Rotate any secret that was ever committed or exposed.

## Next implementation sequence
1. Inventory every SECURITY DEFINER function, its EXECUTE grants, callers, and tenant/role checks.
2. Reconcile SQL functions/policies with committed migrations and tests.
3. Add cross-tenant and privilege-escalation tests in a non-production environment.
4. Make narrow, reviewed database changes with migration history and rollback notes.
5. Re-run Supabase security advisors and all tenant-isolation tests.
6. Only then continue screen/module integration and route/deep-link work.
7. Deploy via an explicit release step after review; do not merge or deploy the visual integration branch as a security fix.


## Follow-up work performed on 2026-10-21

### Development/test project containment
A separate project named `MAHA-HUB Project` (`wragaoglvksbbgmfjyzp`) was inspected as the development/test environment. It contains test records, but the `maha_edc` table had zero rows at the time of review. This project is not the intended production project.

The EDC database functions exposed a high-risk design: `maha_edc_public_submit(text, jsonb)` stores card PAN and CVC/CVV in the database payload. CVC/CVV must not be retained after authorization. Until a PCI-compliant payment-provider tokenization flow replaces this legacy implementation, the following functions have had EXECUTE revoked from `PUBLIC`, `anon`, and `authenticated` **in the development/test project only**:
- `maha_edc_keyed(text, text)`
- `maha_edc_list(text, text)`
- `maha_edc_public_submit(text, jsonb)`
- `maha_edc_put(text, jsonb)`
- `maha_edc_wipe(text, text)`
- `maha_init(text)`

The public `maha_edc_public_get(text)` status lookup remains callable because its returned fields do not include the PAN or CVC/CVV. Post-change privilege checks confirmed the six functions above are no longer executable by `anon` or `authenticated`; the status lookup remains public. The development app's legacy EDC write/admin flows may therefore stop working until they are replaced and regression-tested. The migration is committed on the integration branch at `supabase/migrations/20261021120000_contain_legacy_edc_rpc.sql`.

**Do not apply this EDC containment migration to the intended production project blindly.** First confirm whether EDC is used, replace it with provider tokenization, and test the new flow. The intended production project `Maha-Hub-PMS` (`ulguzclaeksxfhzwuovg`) was not changed.

### Organization membership policy correction in development/test
The `maha_organizations_select_member` policy was confirmed to compare `m.organization_id = m.id`, which is inconsistent with the intended organization membership relation. In the development/test project only, the policy was recreated to compare `m.organization_id = public.maha_organizations.id` while preserving the owner and organization-admin branches. The matching migration is committed on the integration branch at `supabase/migrations/20261021121000_fix_org_member_select_policy.sql`.

The development project currently has no organization/property membership rows to exercise this policy with real authenticated test identities, so this is a schema-level correction, **not yet an end-to-end authorization test**. Before promoting, create test owner/admin/member accounts and verify allowed/denied organization reads; compare the production migration history and apply the same correction to production only after confirming the live policy still has the defect and the test plan passes.

### Development/test project advisor status after containment
The development project's anonymous SECURITY DEFINER warning count dropped from 7 to 1; the remaining finding is the public EDC status lookup. The authenticated SECURITY DEFINER warning count remains because several RPCs are intentionally used by authenticated flows and need per-function authorization review, not blanket revocation. Tables with RLS enabled but no policies have no direct `anon` table grants in the inspected effective privileges; this appears to be default-deny, but must be confirmed with end-to-end tests.


## Evidence limits
- This review used read-only project metadata, schema/policy/grant inspection, deployed Edge Function source, migrations list, and Supabase security/performance advisors.
- The repository's oversized `solutions-PMS.html` could not be fetched through the current GitHub connector, so its current full client code has not been inspected or syntax-tested in this pass.
- No production SQL, Auth settings, customer records, or deployed code were changed.
