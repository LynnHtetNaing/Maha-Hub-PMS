-- Stripe keys, kept on the trusted server only (never read by the browser, not even by the hotel that owns them).
--   * maha_stripe_keys   two different purposes, never mixed:
--       'billing' - Maha Hub's own account that collects every hotel's subscription payment ("Maha Pay" to a hotel).
--                   Always one row, property_id null: one account for the whole platform, nothing to set up per hotel.
--       'guest'   - a hotel's own account that collects ITS guests' / OTA agents' card payments. At most one row per
--                   hotel (property_id set), plus one platform/"helper" row (property_id null) a hotel without its
--                   own account falls back to. This purpose is unchanged in what it does; only where it is read from
--                   is moving here, in a later pass - it still reads from the hotel's own record for now.
--     Only the stripe-keys function (service role) ever reads or writes this table. No one can select it directly,
--     not the owning hotel, not the platform admin - the function alone decides what a caller is told (never the
--     secret key itself, only whether one is set and the publishable key, which is not secret).

create table if not exists public.maha_stripe_keys (
  id uuid primary key default gen_random_uuid(),
  purpose text not null default 'guest' check (purpose in ('billing', 'guest')),
  property_id uuid references public.maha_properties(id) on delete cascade,
  label text not null default '',
  publishable_key text not null default '',
  secret_key text not null default '',
  connect_account_id text not null default '',
  helper_server text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (purpose <> 'billing' or property_id is null)
);
create unique index if not exists maha_stripe_keys_property_uidx on public.maha_stripe_keys(purpose, property_id) where property_id is not null;
create unique index if not exists maha_stripe_keys_platform_uidx on public.maha_stripe_keys(purpose) where property_id is null;
alter table public.maha_stripe_keys enable row level security;
revoke all on public.maha_stripe_keys from public, anon, authenticated;
-- No grants to authenticated at all: only the service role (used solely inside the stripe-keys and stripe-billing-pay functions) can read or write this table.
