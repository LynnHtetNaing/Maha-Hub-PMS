# Maha Hub username/password authentication (staging implementation)

## Intended login experience
- Hotel staff type a username and password.
- Each username maps privately to one Supabase Auth user and a verified recovery email.
- The password is verified by Supabase Auth; Maha Hub never stores or hashes the password itself.
- Email addresses and username mappings are not readable by hotel/browser clients.
- A user can sign in on multiple devices; no device registration is required by default.

## Owner-only platform administration
- `maha_platform_admins` is private and has no browser grants or self-service insert path.
- The platform owner must be added to this table manually using the trusted Supabase SQL editor after their Auth user exists.
- Hotel roles and property memberships are separate from platform-owner access.
- Never use a client-provided role or localStorage flag to decide platform-owner access.

## Files
- `supabase/migrations/20261009_003_username_auth_owner_boundary.sql`: private username mapping and owner boundary.
- `supabase/functions/username-auth/index.ts`: username-to-email lookup followed by Supabase Auth password verification.

## Required staging work before app integration
1. Apply migrations 001, 002, and 003 to a disposable Supabase staging project, not production.
2. Set Edge Function secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never be put in HTML, GitHub Pages, browser storage, or a client-visible config.
3. Deploy `username-auth` with JWT verification disabled for the unauthenticated login request; the function itself handles input validation. Keep CORS restricted to the actual Maha Hub origins before production.
4. Add login rate limiting, abuse monitoring, and recovery-email verification before public launch. The current function is a staging foundation and does not yet implement rate limiting.
5. Build trusted account provisioning that creates Auth users, assigns usernames, links verified recovery email, and creates property membership. Never allow hotel users to write `maha_login_identities` or `maha_platform_admins` directly.
6. Update `ecosystem/index.html` to use Supabase sessions, tenant-scoped cloud load/save, and explicit conflict handling. Do not remove the existing sync or import local data until a verified backup/restore path exists.
7. Test two separate organizations, owner-only admin UI/API, inactive staff, read-only staff, invalid passwords, recovery flow, multiple devices, and concurrent writes against real Supabase staging.

## Safety status
This is not production-ready and does not change the current login/sync in the live app. It must not be merged into production or deployed until the staging gates above are complete. The existing shared-passphrase sync must be disabled only as part of a tested migration, not as a standalone edit.
