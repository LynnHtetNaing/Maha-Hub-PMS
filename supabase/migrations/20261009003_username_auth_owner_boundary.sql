-- Maha Hub username sign-in and platform-owner boundary.
-- Additive only. Do not apply to production until reviewed in a Supabase staging project.
-- Username lookup is private; never expose this table to anon/authenticated clients.

begin;

create table if not exists public.maha_login_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text generated always as (lower(trim(username))) stored,
  recovery_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maha_login_username_format check (
    username = trim(username)
    and length(username) between 3 and 40
    and username ~ '^[A-Za-z0-9._-]+$'
  ),
  constraint maha_login_recovery_email check (
    length(trim(recovery_email)) between 5 and 254
    and position('@' in recovery_email) > 1
  ),
  unique (username_normalized)
);

create table if not exists public.maha_platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  note text
);

alter table public.maha_login_identities enable row level security;
alter table public.maha_platform_admins enable row level security;
revoke all on public.maha_login_identities from public, anon, authenticated;
revoke all on public.maha_platform_admins from public, anon, authenticated;

-- Login identity provisioning and lookup must use a trusted server with service_role.
-- Platform administrators are provisioned manually by the project owner through SQL
-- or a trusted server; hotel accounts cannot grant themselves platform access.

create or replace function public.maha_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_platform_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.maha_is_platform_admin() from public, anon;
grant execute on function public.maha_is_platform_admin() to authenticated;

commit;
