# Maha PMS — Master System Reference
**Document ID:** MPS-MASTER-001  
**Status:** Proposed canonical architecture and product reference  
**Version:** 1.0  
**Created:** 22 October 2026  
**Scope:** New written reference only. This document is intentionally separate from the current PMS implementation and does not change, replace, or assume correctness of existing code, database schema, authentication, or deployments.

## 1. Purpose and authority

This is the master reference for future Maha PMS product design, architecture, security, data modeling, implementation, and acceptance testing. When implementation decisions conflict with this document, do not silently retrofit code or weaken the requirement. Record the conflict, assess migration and customer impact, then approve a versioned change to this reference before implementation.

This is a target-state specification, not proof that the existing system already meets it. Every requirement must be tracked as **Not assessed**, **Designed**, **Implemented**, **Tested**, or **Accepted**. Never label a feature secure or production-ready solely because its code exists.

### 1.1 Product principles
- Multi-property and multi-tenant by design; tenant isolation is a hard security boundary.
- Hotel operations must remain usable during ordinary network interruptions where supported, with clear sync status and safe conflict handling.
- Financial and inventory actions must be traceable, idempotent where retried, and protected against duplicate submission.
- Prefer least privilege, explicit authorization, server-side validation, secure defaults, and auditable administration.
- Separate product modules and integrations through documented contracts rather than tightly coupled, cross-module assumptions.
- Preserve existing working behavior only after tests demonstrate that behavior; do not treat legacy behavior as the specification.
- Do not expose payment credentials or store prohibited payment-card data in PMS records, logs, backups, or analytics.
- Burmese, English, Thai, and Myanmar-script display requirements must be considered in typography, searching, sorting, exports, and printing.

## 2. Product boundary and modules

Maha PMS is the hotel operations system of record. Distribution and direct booking are related products but remain separate bounded modules/services.

### 2.1 PMS core
1. **Property and setup:** property profile, timezone, currency, tax/service-charge configuration, business date, room types, rooms, rate plans, amenities, policies, and operating settings.
2. **Reservations:** direct, walk-in, phone, corporate, group, and externally sourced reservations; status lifecycle, dates, occupancy, rate breakdown, source, guest requests, and cancellation/no-show history.
3. **Front desk:** arrivals, check-in, in-house guests, room moves, extensions, early/late arrangements, check-out, room assignment, and shift handover.
4. **Guest profiles:** contact details, preferences, consent and communication preferences, identity-document handling where lawful, duplicate detection, and retention controls.
5. **Housekeeping and maintenance:** room-cleaning status, out-of-order/out-of-service rooms, maintenance tasks, assignments, timestamps, and history.
6. **Billing and folio:** charges, taxes, service charges, deposits, payments, refunds, transfers, split folios, invoice issuance, void/credit-note workflows, and cashier reconciliation.
7. **Cashier and finance controls:** payment-method configuration, shift closing, cash movement, settlement reconciliation, and controlled exports. PMS records do not replace formal accounting or local tax compliance review.
8. **Reports and dashboards:** operational, occupancy, revenue, arrivals/departures, cashier, and audit reports with role- and property-scoped access.
9. **Users and access:** organizations, properties, memberships, role assignments, invitations, MFA, session lifecycle, and access revocation.
10. **Support and audit:** in-app support, diagnostic information with secrets redacted, security events, audit trails, and controlled support access.

### 2.2 Related Maha products — separate boundaries
- **Maha Connect:** channel/distribution manager and external-provider adapters. It exchanges inventory, availability, rates, restrictions, and reservation updates with PMS through versioned contracts.
- **Maha Booking Engine:** direct-booking interface. It requests availability and creates reservations through an authenticated, rate-limited API; it must not write directly to PMS tables.
- **Maha Reach:** marketing/guest communication capabilities with consent, opt-out, and delivery auditing.
- **Maha POS / Stock / Account / HR / Manage:** separate modules or products. Each must define ownership of data and integration contracts before sharing records.
- **Maha Academy:** education and training product, not part of the PMS authorization or customer-data trust boundary.

A module must not gain access to another module's database tables merely because both are branded Maha. Integrations use explicit APIs, scoped service identities, and documented data contracts.

## 3. Logical architecture

**Clients** (web/tablet/mobile)  
→ **Application/API layer** (authentication, authorization, validation, rate limits, idempotency)  
→ **Domain services** (reservations, room operations, folio, inventory, reporting)  
→ **Data layer** (tenant-scoped relational data, append-only audit events, controlled file storage)  
→ **Integration workers** (provider adapters, retry queues, reconciliation, webhook verification).

Supabase may be used for managed PostgreSQL, Auth, Storage, and Edge Functions, subject to plan capability, configuration, load testing, and operational review. Hosting and deployment choices are implementation decisions; no architecture may depend on exposing privileged database credentials in browser code.

### 3.1 Trust boundaries
- Browser/mobile clients are untrusted. All authorization and business-rule enforcement must be server-side or in database controls that cannot be bypassed by the client.
- Public booking endpoints are a separate, rate-limited surface. They expose only the minimum availability and booking data required.
- Staff, organization administrators, platform operators, support personnel, and integration services are distinct principals with different permissions.
- External provider webhooks are untrusted until signatures, timestamps, replay protection, and payload schema are verified.
- Logs, analytics, exports, backups, and support attachments are sensitive data stores and must follow the same retention and access rules.

## 4. Tenant and property data model

### 4.1 Hierarchy
- **Organization:** customer/company account and organization-level configuration.
- **Property:** one hotel or operational property belonging to an organization.
- **Membership:** a user's active relationship to an organization and/or property, with role and scope.
- **User identity:** authentication identity; it is not itself proof of access to a property.
- **Domain records:** each operational record is associated with its authoritative property (and organization where appropriate).

### 4.2 Mandatory isolation rules
1. Every tenant-owned record must have an explicit, validated tenant/property relationship. Do not infer tenant access from a client-supplied ID.
2. Every read, create, update, delete, export, background job, RPC, and storage operation must verify authorization for the target property.
3. A record ID is not a secret and must never function as authorization.
4. Cross-property references must be validated server-side. Prevent linking a reservation, guest-private data, folio, room, or payment to another tenant by changing an ID.
5. Inactive or revoked memberships lose access immediately, including API and background-operation access.
6. Read-only roles cannot mutate data by calling a different RPC, bulk endpoint, sync endpoint, or legacy function.
7. Organization ownership cannot be transferred through an ordinary profile update. Ownership transfer requires a dedicated, verified, audited process.
8. Platform support access is denied by default, time-limited when granted, scoped, reason-recorded, and audited.
9. Tenant isolation must be tested with separate real user sessions at the API boundary, not only by simulating claims in SQL.

## 5. Identity, authentication, and authorization

### 5.1 Authentication baseline
- Use a supported authentication flow with verified email/identity where applicable, secure password reset, rate limiting, abuse monitoring, and session revocation.
- Require MFA for privileged organization administration and platform administration. Require step-up authentication for sensitive actions such as changing security settings, ownership transfer, or high-risk financial administration.
- Configure leaked/compromised-password protection where supported by the selected authentication plan.
- Do not expose password hashes, access tokens, refresh tokens, OTPs, recovery codes, service-role keys, or provider secrets in logs, URLs, client storage, analytics, or support messages.
- Use short-lived access tokens and secure refresh-token handling; define session expiration, device/session management, and revocation behavior.
- Authentication success alone never grants property access.

### 5.2 Authorization model
Use role-based access control combined with explicit organization/property scope. Minimum roles to model: platform administrator, organization owner, organization administrator, property manager, front desk, reservations, cashier/finance, housekeeping, maintenance, read-only/auditor, and integration service. Actual permissions must be a reviewed matrix, not assumptions based on role names.

Authorization checks must:
- Deny by default.
- Verify user, active membership, role, property scope, and required MFA/assurance level.
- Be enforced consistently in APIs, database functions, RLS policies, storage policies, and background jobs.
- Be covered by positive and negative tests for every role and critical action.
- Avoid relying on UI-hidden buttons or client-side checks.

### 5.3 Privileged database functions
Every SECURITY DEFINER function must have a documented purpose, fixed safe search path, least-privilege EXECUTE grants, explicit authorization checks, validated parameters, safe error handling, and regression tests. Review each function individually. Do not blanket-revoke functions without mapping dependencies; do not assume a function is safe because it is not directly exposed in the UI.

## 6. Core domain rules

### 6.1 Reservations and inventory
- Define a documented state machine and legal transitions for each reservation status.
- Enforce arrival/departure date order, capacity, room availability, room-status constraints, and rate-plan rules server-side.
- Prevent overbooking according to a clearly selected policy; concurrency-sensitive inventory changes must be atomic or protected by database constraints/locking.
- Retries and duplicate webhooks must not create duplicate reservations or duplicate inventory decrements.
- Record source, external reference, actor, timestamps, and relevant before/after changes.
- Cancellation, no-show, room move, extension, and date/rate changes must preserve history.

### 6.2 Billing, folios, and invoices
- Preserve the configured invoice numbering strategy as a business rule. A security guard on client-supplied counter floors must not silently redesign the numbering format, reset sequences, or change tax treatment.
- Invoice identifiers must be unique in the appropriate property/legal scope and generated atomically on the trusted server/database side.
- Client-provided floor values may assist legitimate offline/import reconciliation only under explicit bounds, authorization, and audit. A caller must not be able to poison future sequences with extreme values.
- Define invoice issue, void, refund, credit note, and correction workflows before implementation. Issued financial documents should not be silently edited or deleted; corrections must leave a trace.
- Store currency, amount, tax basis, service-charge basis, rounding policy, and business date explicitly. Use decimal-safe arithmetic and document rounding rules.
- Use idempotency keys for payment/charge requests that may be retried. Prevent duplicate charges and duplicate refunds.
- Separate folio posting from payment capture/settlement state. Reconcile provider transaction IDs, settlement reports, refunds, and reversals.
- Any sequence-bound value must be validated against actual historical data, offline workflows, and legal requirements before production changes.

### 6.3 Payments and cardholder data
- Use a PCI-compliant payment provider's hosted fields, redirect, or tokenization flow where applicable.
- Never store raw PAN, CVC/CVV, PIN data, magnetic-stripe data, or equivalent authentication data in PMS tables, JSON payloads, logs, error reports, backups, or analytics.
- Store only provider-approved references/tokens and minimal transaction metadata.
- Keep provider secret keys in managed server-side secrets, never in frontend code or normal hotel records.
- Verify webhook signatures and replay protection; make webhook handling idempotent.
- A payload key-name detector is a secondary guard only. It is not a substitute for data-flow review, provider architecture, PCI assessment, and scanning actual ingress/egress paths.
- Before enabling any legacy EDC flow, document what data it handles, whether it can store card data, and how it is replaced or safely retired.

### 6.4 Sync and external integrations
- Use versioned contracts, explicit field mapping, stable external IDs, idempotency, bounded retries with backoff, dead-letter handling, and reconciliation jobs.
- Distinguish source-of-truth fields from provider-owned fields; never let a stale provider event overwrite newer local state without conflict policy.
- Verify webhook authenticity and event timestamps; store event IDs to prevent replay.
- Expose sync status and actionable errors to authorized users without leaking secrets.
- Provide a safe manual recovery/replay procedure and an audit trail for manual overrides.

## 7. Data protection, privacy, and audit

- Classify data as public, internal, confidential, or highly restricted; guest identity and contact data, folios, authentication data, and payment references require protection.
- Collect only necessary guest data. Define retention, deletion/anonymization, export, consent, and lawful access workflows appropriate to the markets served.
- Encrypt data in transit and use the platform's managed encryption at rest; restrict and audit access to keys and secrets.
- Redact tokens, passwords, secrets, card data, identity documents, and unnecessary guest details from logs.
- Audit security-sensitive and financial events: authentication/security changes, role and membership changes, reservation changes, folio postings, invoice issue/void, payment/refund actions, exports, support access, and integration overrides.
- Audit records should be append-only to normal application roles and contain actor, scope, action, timestamp, outcome, correlation ID, and safe before/after summaries.
- Never log full secrets or raw card data in order to make debugging easier.

## 8. Database and API engineering rules

- Use migrations that are version-controlled, reviewable, repeatable, and safe to stop on unexpected schema state.
- Do not manually edit internal migration-history tables. Reconcile local and remote history using the supported migration-repair workflow only after schema verification and backup.
- Use database constraints for invariants that must survive concurrent requests.
- Use parameterized queries; validate type, size, range, enum/state transitions, and ownership for all inputs.
- Avoid broad grants and policies. RLS, RPC grants, storage policies, and API authorization must be designed together.
- Paginate list endpoints; bound request size, batch size, export size, query time, and retries.
- Use structured errors that do not reveal SQL internals, secrets, or whether another tenant's private record exists.
- Treat JSON blobs and generic record stores as untrusted input. Recursively validate sensitive fields, but prefer typed columns and schemas for critical financial, identity, and security data.
- Do not allow clients to write internal counters, audit logs, membership state, ownership, payment secrets, or privileged configuration directly.

## 9. Reliability and operations

- Define availability and recovery targets before commercial launch: Recovery Point Objective (RPO), Recovery Time Objective (RTO), maintenance windows, and escalation ownership.
- Automate backups, monitor backup success, and perform a documented restore drill into a separate environment.
- Maintain separate development/test, staging, and production projects with least-privilege credentials and no casual customer-data copying.
- Keep production secrets out of developer laptops, repository history, issue comments, screenshots, and AI prompts.
- Monitor authentication failures, privilege changes, repeated authorization denials, unusual exports, failed payments, queue backlogs, and provider sync drift.
- Provide incident response steps: contain, preserve evidence, rotate credentials, assess affected tenants, notify responsible parties as legally required, recover, and document lessons.
- Maintain a release rollback plan and a clear owner for every production deployment.

## 10. Testing and acceptance gates

No feature is accepted based only on a successful happy-path demo. Required test layers:

1. **Unit tests:** validation, calculations, state transitions, permission decisions, rounding, and mapping rules.
2. **Database tests:** constraints, RLS, function grants, atomic counters, transaction rollback, and concurrent operations.
3. **API integration tests:** real test identities and separate JWT sessions for every role; cross-tenant ID substitution; revoked/inactive users; malformed and oversized payloads; rate limits; replay and idempotency.
4. **Security tests:** anonymous access, privilege escalation, insecure direct object references, secret leakage, injection, CSRF/XSS where relevant, session lifecycle, and abuse cases.
5. **Workflow tests:** reservation → check-in → folio posting → invoice → payment → check-out; cancellations/refunds; room moves; offline/retry behavior; provider webhook duplicates.
6. **Frontend regression tests:** critical screens, keyboard use, responsive layouts, localization, error/loading/empty states, and permission-aware actions.
7. **Operational tests:** backup restoration, deploy rollback, secret rotation, alert delivery, and incident runbook exercise.
8. **External review:** independent security review/penetration test before making strong public security claims.

Every test must record environment, version/commit, test identity/role, expected result, actual result, and whether it was run against SQL only, HTTP/API, browser, or an external provider. Never present simulated JWT claims as equivalent to real API sessions.

## 11. Environment and release control

- **Development/test:** synthetic data; destructive testing permitted only after confirming target project and scope.
- **Staging:** production-like configuration, isolated credentials, synthetic or properly anonymized data, end-to-end validation.
- **Production:** customer data and live configuration; no reset, broad grant, destructive migration, or deployment without a reviewed change plan and verified backup/rollback path.
- Every release needs a migration review, security regression suite, API smoke test, browser critical-path test, monitoring check, and rollback instructions.
- Branches and draft pull requests are not production releases. Keep architecture documentation separate from code implementation until a change is approved.

## 12. Current-state assessment versus target state

The current repository/database must be audited against this reference. Do not infer completion from the document. Initial assessment based on the work performed by 22 October 2026:

| Area | Observed status | Next evidence required |
|---|---|---|
| Organization membership/update policy | Targeted database fixes applied and structurally checked | Real API sessions for owner/admin/member roles |
| Organization owner immutability | Trigger added; temporary-fixture regression passed | Verify every supported ownership-transfer/admin workflow |
| Invoice/counter floor abuse | Bounds added to four functions | Test normal numbering, imports/offline sync, concurrency, and historic ranges |
| Nested secret detection | Recursive checks hardened; compatibility tests passed | Full ingress/egress and payment data-flow review |
| Anonymous SECURITY DEFINER execution | Zero found in latest structural checks | Repeat after every migration/release |
| Auth compromised-password protection | Not enabled; plan/dashboard action required | Enable where supported and test signup/password-change flows |
| Authenticated SECURITY DEFINER functions | 20 reported by advisor at last check | Function-by-function grant, guard, and API review |
| Legacy EDC flow | Contained in development/test; not found in production schema check | Replace/retire and validate provider design before use |
| Real PostgREST authorization tests | Not completed | Separate real test identities/JWTs and automated API suite |
| Browser critical-path regression | Not completed | Run against an isolated staging deployment |
| Migration-history alignment | Mismatch documented | Reconcile safely before CLI push |
| Backup/restore and incident drill | Not evidenced | Perform and record both |

This snapshot is time-bound. Re-run checks after any schema, policy, auth, frontend, or deployment change.

## 13. Implementation sequence

### Phase 0 — Establish truth
- Freeze this reference as the proposed target architecture.
- Inventory current routes, functions, tables, grants, policies, secrets, auth flows, integrations, and deployment configuration.
- Map each existing component to a requirement and label it: reuse, refactor, replace, deprecate, or unknown.
- Reconcile migration histories safely; establish a staging environment and backup/restore evidence.

### Phase 1 — Security foundation
- Complete real-session tenant-isolation and authorization tests.
- Review all SECURITY DEFINER functions and all public/API entry points.
- Complete auth/MFA/session configuration and secret inventory/rotation plan.
- Decide payment-provider architecture; verify no prohibited card data is stored or logged.
- Establish audit, alerting, recovery, and incident procedures.

### Phase 2 — PMS core correctness
- Specify and test reservation state transitions and inventory concurrency.
- Specify folio/invoice/payment/refund state transitions and preserve the existing intended numbering strategy.
- Add idempotency and reconciliation to all retryable financial and integration operations.
- Validate data constraints, retention, and export controls.

### Phase 3 — End-to-end release readiness
- Deploy to staging only after migrations are reconciled.
- Run automated API, browser, security, payment sandbox, localization, load, and restore tests.
- Fix all critical/high findings; document accepted residual risks with owner and expiry.
- Obtain independent security review before broad commercial rollout.

### Phase 4 — Controlled commercial launch
- Pilot with an explicitly approved test property, not an unreviewed production change.
- Monitor errors, access denials, data integrity, sync drift, payments, and performance.
- Expand gradually after acceptance criteria are met.

## 14. Definition of “production-ready”

Maha PMS is not production-ready merely because it runs. Approval requires:
- No unresolved critical/high security findings without a formally approved mitigation.
- Real API evidence for tenant isolation and role permissions.
- Verified authentication, MFA, session revocation, and password protections appropriate to risk.
- Payment flow reviewed against provider and PCI obligations.
- Financial and reservation workflows pass concurrency, retry, and reconciliation tests.
- Migration history, backup/restore, rollback, monitoring, and incident response are proven.
- Critical browser workflows and supported locales pass.
- Independent review and a dated release decision are recorded.

A numeric claim such as “99% secure” is not a valid security metric. Use a dated evidence-based readiness checklist, severity-rated findings, and explicit residual-risk acceptance.

## 15. Change control

Any amendment to this master reference must include:
- Requirement ID and reason for change.
- Impact on data, security, billing, users, integrations, and migration/rollback.
- Tests and evidence required.
- Version/date and approver.

Do not use this document to justify a broad rewrite or immediate production changes. First complete the current-state inventory and map the safest incremental route from the actual system to this target architecture.
