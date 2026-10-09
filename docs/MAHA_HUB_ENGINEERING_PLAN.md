# Maha Hub Engineering Plan

Status: initial source-code audit; not a penetration test. This document records findings and a safe implementation sequence. It does not change production behavior.

## Working rules
- Work on `codex/maha-hub-hardening`; do not commit to `main`.
- Preserve the current Maha brand, Myanmar-inspired visual identity, and existing user workflows unless a change is necessary and reviewed.
- Do not deploy from this branch or merge automatically.
- Never put Stripe secret keys, Supabase service-role keys, passwords, or other credentials in browser code, committed files, issues, or logs.
- Test with synthetic hotel/guest data only.

## Initial findings from source review

### P0 — Payment secrets and public payment endpoints
- The Cloudflare Stripe Worker accepts a `secret` value from request bodies for checkout and collection endpoints, and accepts `X-Maha-Stripe-Secret` on invoice/session lookup endpoints. This allows a browser caller to supply a Stripe secret rather than keeping payment authority exclusively in server-side configuration.
- The Worker currently defaults CORS to `*`. CORS is not authentication, so narrowing origins alone would not secure the endpoints; the endpoints also need trusted authorization and request validation.
- The local Node Stripe helper has a similar per-request secret override pattern.
- Target state: secrets stay in server-side environment bindings; authenticated and authorized hotel users initiate actions; the server resolves the permitted Stripe account from trusted tenant configuration; endpoints validate amount, currency, allowed return URLs, hotel ownership, and rate limits.

### P0 — Authentication and tenant isolation
- The current Supabase schema stores one shared cloud payload and authorizes cloud operations with a shared passphrase. It does not identify individual staff members or enforce row-level access by hotel/user.
- Client-side UI roles are not a security boundary. A production SaaS needs trusted server-side authorization and database policies for every tenant-owned record.
- Target state: individual accounts, server-enforced roles, tenant/property membership, tenant-scoped records, secure session handling, and tests proving one hotel cannot read or modify another hotel's data.

### P1 — Cloud data integrity and recovery
- The cloud schema stores the application state as one JSON payload. Conflict handling and backup/restore behavior need tests before operational hotel data is trusted.
- Add migration/versioning, audit events for important operations, tested backups, restore procedures, and multi-device conflict tests.

### P1 — Product claims and customer readiness
- Reconcile product availability statements between homepage, product page, metadata, and actual capabilities.
- Verify the contact form's delivery path and give the visitor a clear success/failure state.
- Review security/privacy/terms wording against actual implemented safeguards before marketing the system as production-ready.

### P2 — Maintainability and quality
- The ecosystem application is a large single HTML/JavaScript file. Refactor incrementally only after test coverage and behavior inventory exist.
- Add automated checks for JavaScript syntax, critical security invariants, core workflows, and build/deployment configuration.

## Implementation sequence

1. **Baseline and inventory:** map routes, data models, sign-in flows, payment flows, cloud sync, and deployment bindings. Add synthetic-data tests and capture current behavior.
2. **Payment boundary:** move all Stripe secret use to server-only bindings; remove client-supplied secret overrides only together with an explicit migration path for hotel-owned Stripe accounts. Add tenant authorization, request validation, rate limits, and tests.
3. **Authentication and tenant isolation:** choose and configure the trusted identity model; migrate from shared passphrase to individual accounts and server-enforced property membership. Write database migrations and access-control tests before switching live data.
4. **Data reliability:** introduce versioned data changes, backup/restore checks, and concurrent multi-device tests.
5. **Website and UX consistency:** reconcile product claims, fix contact submission feedback, and improve onboarding and help text without redesigning the established brand.
6. **Release review:** run automated checks, review the full diff, prepare a pull request, and wait for explicit approval before merge/deployment.

## Release gate
Do not use the current build with real guest data or live Stripe secrets until the authentication, tenant-isolation, and payment-secret issues have been addressed and independently tested. This source review alone does not establish that the live service has been compromised.

## Work completed on the hardening branch

- The Stripe Worker now rejects browser requests whose `Origin` is not in the exact configured allowlist. It no longer defaults to wildcard CORS in code.
- Worker checkout success/cancel URLs must use HTTPS and an explicitly allowed origin, reducing open-redirect abuse.
- Stripe amount parsing now rejects non-finite values, invalid currency codes, and values that overflow safe integer minor units.
- Added Node built-in tests for origin rejection, trusted-origin behavior, off-site return URL rejection, and invalid amount rejection.
- Updated Worker configuration to allow only `https://maha-hub.com` and `https://www.maha-hub.com` by default. Add any legitimate custom production frontend origins explicitly before release.
- These changes are committed only to `codex/maha-hub-hardening`; no deployment has been made.

## Verification and remaining blockers

- Automated tests are added but could not be executed in this environment because a GitHub clone attempt failed at network DNS resolution. Do not mark them as passing until run in CI or a connected development environment.
- This is an interim hardening step, not a complete payment security fix. CORS does not authenticate callers. The Worker still supports client-supplied hotel Stripe secrets and account IDs for backward compatibility; those need a tenant-aware server-side credential migration and authorization before production use.
- The shared-passphrase Supabase model and client-side role checks remain unresolved. Do not represent Maha Hub as production-secure or process real guest/payment data on the strength of these changes alone.

## Additional authentication and cloud-sync findings

A second source pass of the current `main` branch found the following details:

- The browser stores the cloud passphrase in `localStorage` as part of `mahahub.cloud`. It is therefore available to scripts running in the same origin and is not protected by browser storage encryption.
- The Supabase RPC functions authenticate possession of one shared passphrase, not a named user identity. Any client that has the project URL, public key, and passphrase can pull or replace the entire shared JSON payload.
- The payload is one global `db` row, not one row per tenant/property. The client explicitly syncs staff account password hashes with the hotel file, while local role/permission checks remain browser-side and can be modified by a client.
- The browser strips the session, card vault, and hotel Stripe secret from the cloud payload. That is useful data minimization, but it does not provide tenant isolation or server-enforced staff authorization.
- The demo seed includes known sample accounts/passwords. These are demo defaults and must not be treated as secure production credentials; removing them needs a first-run/setup migration so existing local hotel data is not accidentally locked out.
- Cloud sync conflict detection compares client timestamps. It needs concurrency tests and a version/compare-and-swap design before it can safely coordinate concurrent edits from multiple devices.

### Cloud/authentication migration guardrails

Do not silently replace the existing RPC signatures or enable a new identity system before migration tooling exists. A safe staged migration should:

1. Add a versioned schema for organizations, properties, memberships, staff identities, and tenant-owned records.
2. Use Supabase Auth (or another trusted identity provider) for individual accounts; enforce membership and roles in database policies/RPCs, not only the UI.
3. Create a tenant-scoped migration/import path from the current shared payload, with a dry-run report and a downloadable backup.
4. Add tests proving users cannot read/write another property's data, inactive users lose access, and conflicting writes are rejected rather than silently overwriting data.
5. Keep old sync available only during an explicit migration window; clearly warn administrators before switching, and provide a tested rollback/export route.
6. Move payment credential ownership to a trusted server-side tenant configuration before disabling the legacy browser-supplied Stripe-key path.

Until these steps are implemented and tested, the current cloud feature should be described as shared-passphrase sync, not production-grade multi-tenant cloud security.

## Next implementation step: additive tenant schema foundation

Added `supabase/migrations/20261009_001_tenant_identity_foundation.sql` as an **additive, not-yet-applied migration**. It introduces:

- Organization records with an owner tied to a Supabase Auth user.
- Property records scoped to an organization.
- Active/inactive memberships with organization-wide or property-specific roles.
- RLS policies for organization/property visibility and administrative property changes.
- Security-definer helper functions with an empty search path to check organization-admin and property access.
- No browser permission to create/change memberships directly; provisioning is reserved for a trusted backend.

This migration does not modify or replace the legacy shared-payload tables/RPCs and has not been applied to any Supabase project. It does not yet connect the current browser app to Supabase Auth or migrate any existing hotel data.

### Required validation before any deployment

- Run the migration in a disposable Supabase staging project and confirm it applies cleanly on the project's PostgreSQL version.
- Use at least two test organizations and three test users (owner/admin, property staff, unrelated tenant) to verify all RLS cases.
- Verify inactive memberships immediately lose access, property staff cannot see sibling properties, and one organization cannot enumerate another organization's data.
- Verify trusted provisioning is the only path to adding/removing memberships and that owners cannot self-assign privileged membership rows.
- Add automated database integration tests before linking the live ecosystem app.
- Plan a dry-run importer, backup/export, migration report, and rollback before touching any real tenant payload.

**Status:** the schema foundation is merged into `main`, but SQL execution and RLS integration tests are not yet verified. Do not apply to production or claim tenant isolation is complete.


## Next stage: tenant-scoped cloud payload storage

Added `supabase/migrations/20261009_002_property_cloud_storage.sql` on the cloud PMS implementation branch. This is a separate additive migration and has not been applied.

- Adds one versioned cloud payload per property, rather than one global payload for all hotels.
- Requires Supabase Auth identity and the existing property-access helper for reads and writes.
- Exposes read/save RPCs to authenticated clients while withholding direct browser insert/update/delete privileges on the payload table.
- Uses a monotonically increasing version and expected-version check to detect concurrent edits rather than trusting client clocks.
- Rejects payloads containing card PAN/CVC/CVV, browser session state, and nested Stripe secret fields as a server-side defense-in-depth measure.
- Does not yet connect the browser PMS to Supabase Auth or map the existing `DB.hotels` structure to property records.
- Does not migrate the legacy shared-passphrase payload, and does not remove the legacy RPCs.

### Validation still required

1. Apply both migrations in a disposable Supabase staging project and confirm the project PostgreSQL version supports the SQL.
2. Test organization/property isolation and inactive memberships with separate Auth users.
3. Test first save, version increments, stale-version conflict response, and two simultaneous first saves.
4. Test forbidden-key rejection including nested arrays and objects.
5. Verify that unauthenticated requests and users outside the property fail, and that browser clients cannot write directly to the payload table.
6. Build an explicit, backed-up importer and per-property data mapping before enabling this storage in the app.

**Current implementation status:** database groundwork only. The existing app still uses the legacy shared-passphrase sync until a separate, tested app integration and migration is completed.
