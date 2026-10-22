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

### Transaction-scoped tenant-isolation regression checks
A transaction-scoped test was run in `MAHA-HUB Project` using three existing test auth identities and temporary organizations/properties/records. The transaction was rolled back. The test completed without assertion errors and checked:
- Owner A can access Hotel A but cannot access Hotel B.
- Owner B can access Hotel B but cannot access Hotel A.
- Cross-tenant `maha_sync_pull` and `maha_sync_push` requests raise authorization denial.
- Read-only staff can access their assigned property, cannot write, and cannot access another hotel's property.
- Read-only staff `maha_sync_push` is denied.

The reusable test script is committed at `supabase/tests/tenant_isolation.sql` on the integration branch. This is useful positive evidence for the helper/RPC authorization logic, but it is **not a full RLS/PostgREST acceptance test**: the checks ran inside a database transaction with simulated JWT claims, not through REST using separate real user sessions. The organization membership SELECT policy also still needs a direct RLS test under the authenticated role.

### Development/test project advisor status after containment
The development project's anonymous SECURITY DEFINER warning count dropped from 7 to 1; the remaining finding is the public EDC status lookup. The authenticated SECURITY DEFINER warning count remains because several RPCs are intentionally used by authenticated flows and need per-function authorization review, not blanket revocation. Tables with RLS enabled but no policies have no direct `anon` table grants in the inspected effective privileges; this appears to be default-deny, but must be confirmed with end-to-end tests.


## Evidence limits
- This review used read-only project metadata, schema/policy/grant inspection, deployed Edge Function source, migrations list, and Supabase security/performance advisors.
- The repository's oversized `solutions-PMS.html` could not be fetched through the current GitHub connector, so its current full client code has not been inspected or syntax-tested in this pass.
- No production SQL, Auth settings, customer records, or deployed code were changed.


### Follow-up: public EDC lookup containment (2026-10-21)
Further review found that `maha_edc_public_get(text)` returns the entire `meta` JSON object to unauthenticated callers. Although it does not directly return PAN/CVC, unrestricted metadata can expose unintended booking or customer details if callers place them in that field. The test project's `maha_edc` table currently has zero rows, and the legacy submit/write flow is already disabled pending a safe payment-provider replacement.

As a narrow containment step, EXECUTE was revoked from `PUBLIC`, `anon`, and `authenticated` on `public.maha_edc_public_get(text)` in the development/test project only. A post-change privilege query confirmed both `anon` and `authenticated` can no longer execute it. The security advisor now reports zero anonymous-executable SECURITY DEFINER functions; 20 authenticated-executable SECURITY DEFINER functions remain for individual review. The migration is committed on `integration/live-pms-calm-theme` at `supabase/migrations/20261021123000_contain_public_edc_lookup.sql`.

This intentionally disables the legacy public EDC lookup as well as the already-contained card-submit flow. Do not restore public access until the replacement endpoint returns only an explicit allowlist of non-sensitive fields and the payment flow uses a PCI-compliant provider tokenization design. Do not apply to production without checking its current function grants and EDC usage.

### Additional grant verification
For the 13 tables flagged by the advisor as RLS-enabled without policies, effective privilege checks in the development/test project found no direct `anon` table access and no direct `authenticated` SELECT/INSERT/UPDATE/DELETE grants. This is consistent with default-deny table access and controlled RPC usage, rather than a reason to add broad RLS policies. The tables still require end-to-end REST checks before production approval.

### Invoice and platform settings RPC review
A targeted source review found that the reviewed invoice issuance RPCs check `auth.uid()` and call `maha_can_write_property(target_property)`; the platform-settings read/write functions check authentication and platform-admin/session authorization. The property-cloud read/write functions check property access/write permission. This is positive source-level evidence, not a complete adversarial test. Invoice counter floor arguments may affect numbering integrity if a valid writer submits an unexpectedly high floor value; trace client usage and define bounds/monotonicity rules before changing these functions, since a premature cap could break legitimate offline synchronization.


### Follow-up: membership mutation boundary and invoice-floor semantics (2026-10-21)

In the development/test project, `maha_memberships` grants `authenticated` SELECT only; no direct `anon` or `authenticated` INSERT/UPDATE/DELETE grants were present. Its only inspected policy is a SELECT policy allowing a user to read their own membership or an organization admin to read memberships for that organization. The inspected staff-provisioning, staff-active, staff-rename, and staff-email functions are SECURITY DEFINER but have EXECUTE granted only to `service_role` (plus the database owner), not browser roles. This reduces the direct self-promotion/role-tampering surface at the database grant layer. It does not replace an end-to-end test of the deployed Edge Function and API path that provisions or changes staff access.

The invoice tests in the integration branch explicitly use higher floor values to recover/continue an existing series (for example, a month sequence floor of 40) and expect lower floors not to rewind the series. The issuance functions therefore intentionally take a caller-supplied floor and advance counters using `greatest(current, supplied_floor)`. An unexpectedly large floor from a valid write-capable user could create a large numbering jump, but adding a simple low cap could break legitimate recovery/offline synchronization. No invoice function was changed. Before remediation, inspect the actual client call sites and determine whether the floor represents a trusted local high-water mark, a server-read value, or untrusted user-controlled data; then add an explicit upper-bound/authorization rule and regression tests for both recovery and abuse cases.

### Auth configuration limitation

The connected Supabase tools available for this review expose database SQL, advisors, and Edge Function source, but not project Auth configuration controls. Compromised-password protection and OTP expiry remain unmodified and need to be checked in the Supabase Dashboard Auth settings. Do not treat them as fixed.


### Follow-up: direct authenticated-role RLS regression checks (2026-10-22)

Additional transaction-scoped tests were run in the development/test project by creating temporary fixture organizations, properties, memberships, and records, switching to the PostgreSQL `authenticated` role, setting simulated JWT claims, querying through the actual table RLS policies, and rolling back the fixtures. Results:
- Owner A sees only their own property when the test JWT includes `aal2` where required: passed.
- An active member sees only their assigned organization and membership row: passed.
- An active read-only staff member sees only the assigned property and its records: passed.
- An inactive member sees no assigned organization, property, or records: passed.

One initial owner-property assertion without the `aal2` claim returned zero rows. Inspection showed the owner access helper intentionally requires `aal2` when verified MFA is enrolled. Re-running with an `aal2` claim passed. This is expected MFA enforcement, not a cross-tenant leak.

These tests are stronger than calling helper functions alone because they exercise table RLS as the `authenticated` role, but JWT claims were still simulated inside SQL. The available connected tools do not provide a direct authenticated PostgREST/API invocation capability, so separate real JWT REST tests remain outstanding. The test fixtures were rolled back; no persistent test rows were left by these checks. No production project was touched.


### Fresh security advisor snapshot (2026-10-22)

The latest Supabase security advisor for the development/test project reports:
- No anonymous-executable SECURITY DEFINER finding in the returned findings (the earlier targeted privilege check also found none after EDC containment).
- 20 SECURITY DEFINER functions callable by `authenticated`; each remains subject to function-by-function review. Several are expected application RPCs, so this warning is not itself proof of a vulnerability.
- 13 RLS-enabled tables with no policies. Earlier effective-grant inspection found no direct browser-role table grants for these tables; keep the default-deny posture and verify the controlled RPC paths rather than adding permissive policies to silence the warning.
- Leaked-password protection remains disabled. This setting still requires a dashboard change and validation; it has not been changed.


### Additional authorization finding (2026-10-22)

**Finding fixed in the development/test project:** the original maha_organizations_update_admin RLS policy allowed updates when owner_user_id = auth.uid() OR maha_is_org_admin(id). The direct owner branch bypassed the shared maha_owner_session_ok() check, which enforces AAL2 when a verified MFA factor is enrolled. Since the policy allowed organization-row updates generally, this could allow a signed-in owner with verified MFA to update organization-level fields without satisfying the expected AAL2 policy.

**Change:** replaced the policy so both USING and WITH CHECK require public.maha_is_org_admin(id). Applied only to the development/test project wragaoglvksbbgmfjyzp; verified the stored policy expression uses the helper in both clauses. Migration and structural regression assertion:
- supabase/migrations/20261022130000_require_org_admin_for_org_updates.sql
- supabase/tests/organization_update_policy.sql

This is a targeted policy-level fix, not a full API-level MFA test. The production project ulguzclaeksxfhzwuovg remains untouched. Do not apply the migration to production until the release branch is reviewed and the owner/org-admin update flow is tested with real JWT sessions both with and without verified MFA.

### Remaining release blockers

- Perform real PostgREST/API tests with separate user JWTs for owner, org admin, property admin, staff, read-only staff, inactive users, and a second tenant. SQL-simulated claims are useful but do not replace these tests.
- Confirm the legacy EDC flow is retired/replaced with a PCI-compliant provider tokenization flow before restoring any EDC RPC access. Never persist CVC/CVV after authorization; review whether legacy PAN data exists in any other tables, logs, backups, or exports.
- Enable and verify leaked-password protection in Supabase Auth; review OTP expiry against the provider's current recommendation.
- Review the 20 authenticated-callable SECURITY DEFINER functions individually and test each through the API. Avoid blanket revocation because core application RPCs need browser access.
- Review invoice numbering floor arguments for large jumps/abuse and verify offline-sync compatibility before imposing bounds.
- Run production-like build, browser, and end-to-end regression tests; this audit is not a penetration test or compliance certification.


### Security posture regression assertions (2026-10-22)

Added supabase/tests/security_posture.sql and executed its assertions against the development/test database. The assertions passed: every public SECURITY DEFINER routine has a fixed search_path; no public SECURITY DEFINER routine is executable by anon; the 13 internal tables flagged for RLS-without-policies have no direct anon/authenticated table grants; and the organization-update policy uses the MFA-aware org-admin predicate without a direct owner bypass. These are database-level checks and do not replace API tests or Auth dashboard configuration.


A transaction-scoped RLS regression was also run using a development/test account with a verified MFA factor. With the same owner JWT subject simulated at AAL1, an organization update affected zero rows (blocked); with AAL2, the update succeeded. Both fixtures were rolled back. This validates the database policy/helper interaction under simulated claims, not real JWT issuance or PostgREST transport.


### Invoice/counter floor abuse hardening (2026-10-22)

The invoice and number-lease RPCs accepted client-supplied floor values without an upper bound. A user who already had write access to a property could submit an extremely large floor and push the hotel's invoice sequence forward, potentially disrupting future issuance. The development/test project had a maximum existing counter of 1,301 and maximum registered invoice number of 7 at the time of the change.

Added a conservative upper bound of 1,000,000,000 to client-provided invoice/counter floor values in `maha_issue_invoice_no`, `maha_issue_invoice_number`, `maha_issue_invoice_ref`, and `maha_lease_numbers`. Oversized values now raise SQLSTATE 22023 before counter mutation. The migration was applied only to the development/test project `wragaoglvksbbgmfjyzp`. Regression tests attempted oversized floors against all four RPCs under simulated authenticated owner/AAL2 claims; all were rejected and the transaction rolled back. Migration and test:
- `supabase/migrations/20261022143000_bound_invoice_and_counter_floors.sql`
- `supabase/tests/invoice_counter_floor_bounds.sql`

Before production rollout, validate the bound against real customer invoice numbering requirements and offline-sync/import scenarios.


### Auth password protection plan limitation (2026-10-22)

The connected Supabase organization is currently on the Free plan. Supabase's current password-security documentation states leaked-password protection is available on Pro and above, so this control cannot be enabled on the current plan through the available project tooling. No plan upgrade or billing change was made. This remains a dashboard/plan-level decision; once eligible, enable leaked-password protection in Authentication → Settings and re-run the Security Advisor. The existing Auth warning is therefore unresolved rather than silently dismissed.

### Regression suite rerun (2026-10-22)

Fetched and executed the repository versions of `security_posture.sql`, `tenant_isolation.sql`, `invoice_counter_floor_bounds.sql`, and `organization_update_policy.sql` against the development/test project. All completed without assertion errors. These are database-side tests with simulated JWT claims where applicable; they do not establish real PostgREST/API behavior.


### Nested secret-payload detection fix (2026-10-22)

A recursive scan of the 594 development/test `maha_records` payloads found one empty `secret` placeholder nested at `collection=$set`, `key=stripe`; no card-data keys were found by the recursive scan, and the existing helper reported zero flagged payloads. Review showed the helper only rejected `secret` when its immediate parent key was `stripe`, so a non-empty secret under the common `{ "v": { ... } }` record wrapper could bypass that check.

Updated `maha_payload_has_forbidden_keys` in the development/test project to reject non-empty nested `secret`, `secret_key`, `api_secret`, `private_key`, and `client_secret` values regardless of wrapper depth, while retaining rejection of PAN/CVC/CVV/cardvault/session keys. Tests passed for nested secret, nested CVC, empty placeholder compatibility, and ordinary guest/room data. The existing test data's `secret` placeholder is empty; no secret value was displayed or changed. Migration and test:
- `supabase/migrations/20261022150000_harden_nested_secret_payload_detection.sql`
- `supabase/tests/payload_secret_detection.sql`


The payload-secret regression was also tested through the actual database write RPCs: `maha_sync_push` rejected a non-empty nested secret; `maha_save_property_cloud` rejected a nested `secret_key`; and a Stripe-shaped record with an empty secret placeholder was accepted. All successful test writes were rolled back. This still tests database functions under simulated claims, not an HTTP/PostgREST request.
