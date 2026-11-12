-- Maha Hub: the admin (platform owner) and a trusted device.
--
-- Until now an admin session could use the admin's power only after the 6-digit Authenticator step (JWT aal = 'aal2'), every sign-in, in every system.
-- From now on the Authenticator is asked ONCE for each device and is then trusted for 14 days (the emailed device code stays at 30 days):
--   * on a device the admin trusted, the admin signs in to the systems (PMS, Sales, Billing, the later ones) with the password alone;
--     the sign-in function then registers that session in maha_admin_sessions (valid 12 hours) and the admin sees what the admin may see;
--   * on any other device the password alone shows nothing: the Authenticator step is needed first (and it makes that device trusted);
--   * the Provider console is not changed: it always asks the Authenticator, and only an aal2 session may CHANGE anything of a hotel
--     (maha_can_write_property and maha_is_org_admin stay aal2 only; the Console functions already demand aal2).
-- A trusted-device session therefore READS (hotels, Sales, Billing) but cannot write a hotel. The pages show it read-only.
--
-- Also closes a gap: an admin with no Authenticator yet had full access until they enrolled. An active platform admin now always needs aal2
-- (a hotel owner who is not an admin is not affected: they never had an authenticator). Enrolling needs no hotel access.
--
-- Additive and replaceable. Run on staging first, then live, BEFORE the pages and the functions that use it are published.
-- Needs 20261009_009_provider_mfa_gate.sql, 20261011_015_hotel_recycle_bin.sql and 20261030120000_admin_team.sql first.

begin;

-- ---- the devices where this admin passed the Authenticator, and the sessions that may read without it ----
create table if not exists public.maha_admin_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  trusted_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.maha_admin_devices enable row level security;
revoke all on public.maha_admin_devices from public, anon, authenticated;

create table if not exists public.maha_admin_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists maha_admin_sessions_user_idx on public.maha_admin_sessions(user_id);
alter table public.maha_admin_sessions enable row level security;
revoke all on public.maha_admin_sessions from public, anon, authenticated;

-- ---- used by the sign-in function (service role only) ----
create or replace function public.maha_admin_device_ok(p_user uuid, p_device_hash text, p_days integer default 14)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_admin_devices d
    where d.user_id = p_user and d.device_hash = p_device_hash
      and d.trusted_at > now() - make_interval(days => greatest(coalesce(p_days, 14), 1))
  );
$$;

create or replace function public.maha_admin_trust_device(p_user uuid, p_device_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.maha_admin_devices(user_id, device_hash, trusted_at)
  values (p_user, p_device_hash, now())
  on conflict (user_id, device_hash) do update set trusted_at = now();
end;
$$;

create or replace function public.maha_admin_register_session(p_user uuid, p_session uuid, p_hours integer default 12)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.maha_admin_sessions where expires_at < now();
  insert into public.maha_admin_sessions(session_id, user_id, expires_at)
  values (p_session, p_user, now() + make_interval(hours => greatest(coalesce(p_hours, 12), 1)))
  on conflict (session_id) do update set expires_at = excluded.expires_at, user_id = excluded.user_id;
end;
$$;

-- the admin forgets every trusted device (or the Main admin does it for another admin)
create or replace function public.maha_admin_forget_devices(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.maha_admin_devices where user_id = p_user;
  delete from public.maha_admin_sessions where user_id = p_user;
end;
$$;

-- the Main admin resets the Authenticator of an admin (lost or new phone): the next sign-in shows a new QR code to scan
create or replace function public.maha_admin_reset_mfa(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.mfa_factors where user_id = p_user;
  perform public.maha_admin_forget_devices(p_user);
end;
$$;

revoke all on function public.maha_admin_device_ok(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.maha_admin_trust_device(uuid, text) from public, anon, authenticated;
revoke all on function public.maha_admin_register_session(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.maha_admin_forget_devices(uuid) from public, anon, authenticated;
revoke all on function public.maha_admin_reset_mfa(uuid) from public, anon, authenticated;
grant execute on function public.maha_admin_device_ok(uuid, text, integer) to service_role;
grant execute on function public.maha_admin_trust_device(uuid, text) to service_role;
grant execute on function public.maha_admin_register_session(uuid, uuid, integer) to service_role;
grant execute on function public.maha_admin_forget_devices(uuid) to service_role;
grant execute on function public.maha_admin_reset_mfa(uuid) to service_role;

-- ---- the gates ----
-- WRITE and Console power: aal2 only. An active platform admin always needs it; another owner (a hotel owner) without an authenticator keeps the old rule.
create or replace function public.maha_owner_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or (
        not public.maha_has_verified_mfa((select auth.uid()))
        and not exists (select 1 from public.maha_platform_admins a where a.user_id = (select auth.uid()) and a.active)
      );
$$;

-- READ power: aal2, or a session of a device the admin trusted (registered by the sign-in function, 12 hours)
create or replace function public.maha_owner_read_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.maha_owner_session_ok()
      or exists (
        select 1 from public.maha_admin_sessions s
        where s.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
          and s.user_id = (select auth.uid())
          and s.expires_at > now()
      );
$$;

-- "is an active admin": the admin power (Sales, Billing, the logs) now needs the read gate too, so a stolen password alone sees nothing.
create or replace function public.maha_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_platform_admins a
    where a.user_id = (select auth.uid()) and a.active
  ) and public.maha_owner_read_ok();
$$;

-- only "is this person an admin" (no gate): the page asks it right after the password to know whether the admin steps apply
create or replace function public.maha_is_platform_admin_raw()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_platform_admins a
    where a.user_id = (select auth.uid()) and a.active
  );
$$;

-- what this session may do: '' (not an admin), 'full' (Authenticator passed), 'limited' (trusted device), 'none' (password only: the Authenticator step is needed)
create or replace function public.maha_admin_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.maha_platform_admins a where a.user_id = (select auth.uid()) and a.active) then ''
    when coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' then 'full'
    when exists (
      select 1 from public.maha_admin_sessions s
      where s.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and s.user_id = (select auth.uid()) and s.expires_at > now()
    ) then 'limited'
    else 'none'
  end;
$$;

-- hotels: the owner branch READS with the read gate and WRITES (maha_can_write_property, maha_is_org_admin) with aal2 only
create or replace function public.maha_can_access_property(target_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.maha_properties p
      join public.maha_organizations o on o.id = p.organization_id
      where p.id = target_property
        and p.deleted_at is null
        and o.owner_user_id = (select auth.uid())
        and public.maha_owner_read_ok()
    )
    or exists (
      select 1
      from public.maha_properties p
      join public.maha_memberships m
        on m.organization_id = p.organization_id
       and (m.property_id is null or m.property_id = p.id)
      where p.id = target_property
        and p.deleted_at is null
        and m.user_id = (select auth.uid())
        and m.active
    );
$$;

revoke all on function public.maha_owner_session_ok() from public, anon, authenticated;
revoke all on function public.maha_owner_read_ok() from public, anon, authenticated;
revoke all on function public.maha_can_access_property(uuid) from public, anon;
grant execute on function public.maha_can_access_property(uuid) to authenticated;
revoke all on function public.maha_is_platform_admin() from public, anon;
grant execute on function public.maha_is_platform_admin() to authenticated;
revoke all on function public.maha_is_platform_admin_raw() from public, anon;
grant execute on function public.maha_is_platform_admin_raw() to authenticated;
revoke all on function public.maha_admin_mode() from public, anon;
grant execute on function public.maha_admin_mode() to authenticated;

commit;
