-- Maha Hub: hotel Recycle bin (cloud).
--
-- Deleting a hotel never erases it at once. The hotel is marked deleted, disappears for everyone (sign-in,
-- sync, lists), and is kept for 30 days. During that time the provider can restore it exactly as it was.
-- After that, or when the provider deletes it permanently from the bin, all of its data is removed.
--   * Hotel codes and staff usernames stay reserved while a hotel is in the bin, so a restore never clashes.
--   * Only the trusted platform-admin-provision function (service role) can delete, restore or purge.
--   * Browsers have no way to change the deleted markers (a trigger refuses it).
--   * The permanent activity log is kept; it is not part of a hotel.

begin;

alter table public.maha_properties
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maha_properties_recycle_pair') then
    alter table public.maha_properties
      add constraint maha_properties_recycle_pair check ((deleted_at is null) = (purge_at is null));
  end if;
end
$$;

create index if not exists maha_properties_deleted_at_idx on public.maha_properties(deleted_at) where deleted_at is not null;
create index if not exists maha_properties_deleted_by_idx on public.maha_properties(deleted_by);

-- Only the functions below may change the deleted markers.
create or replace function public.maha_guard_property_recycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.deleted_at is distinct from old.deleted_at
      or new.purge_at is distinct from old.purge_at
      or new.deleted_by is distinct from old.deleted_by)
     and coalesce(current_setting('maha.recycle_op', true), '') <> 'on' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.maha_guard_property_recycle() from public, anon, authenticated;

drop trigger if exists maha_properties_recycle_guard on public.maha_properties;
create trigger maha_properties_recycle_guard
before update on public.maha_properties
for each row execute function public.maha_guard_property_recycle();

-- A deleted hotel is invisible and unusable for everyone, the provider included. These are the same two
-- access checks as migration 009 with one more condition; every policy and every sync/invoice function
-- already goes through them.
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
        and public.maha_owner_session_ok()
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

create or replace function public.maha_can_write_property(target_property uuid)
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
        and public.maha_owner_session_ok()
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
        and m.role <> 'read_only'
    );
$$;

revoke all on function public.maha_can_access_property(uuid) from public, anon;
revoke all on function public.maha_can_write_property(uuid) from public, anon;
grant execute on function public.maha_can_access_property(uuid) to authenticated;
grant execute on function public.maha_can_write_property(uuid) to authenticated;

-- Move a hotel to the Recycle bin. Returns the staff accounts to lock out (never the provider, and never
-- someone who also works at another hotel that is still live).
create or replace function public.maha_recycle_hotel(p_owner uuid, p_property_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_deleted timestamptz;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_purge timestamptz;
  v_users jsonb;
begin
  select p.property_code, p.deleted_at into v_code, v_deleted
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'already-deleted' using errcode = '22023';
  end if;

  perform set_config('maha.recycle_op', 'on', true);
  v_purge := now() + make_interval(days => v_days);
  update public.maha_properties
  set deleted_at = now(), purge_at = v_purge, deleted_by = p_owner
  where id = p_property_id;
  perform set_config('maha.recycle_op', 'off', true);

  select coalesce(jsonb_agg(distinct m.user_id), '[]'::jsonb) into v_users
  from public.maha_memberships m
  where m.property_id = p_property_id
    and m.user_id <> p_owner
    and not exists (select 1 from public.maha_platform_admins a where a.user_id = m.user_id)
    and not exists (
      select 1
      from public.maha_memberships m2
      join public.maha_properties p2 on p2.id = m2.property_id
      where m2.user_id = m.user_id and m2.property_id <> p_property_id
        and p2.deleted_at is null and m2.active
    );

  return jsonb_build_object('property_id', p_property_id, 'property_code', v_code, 'purge_at', v_purge, 'staff_user_ids', v_users);
end;
$$;

-- Take a hotel out of the Recycle bin (only while it is still within its 30 days).
create or replace function public.maha_restore_hotel(p_owner uuid, p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_purge timestamptz;
  v_deleted timestamptz;
  v_users jsonb;
begin
  select p.property_code, p.deleted_at, p.purge_at into v_code, v_deleted, v_purge
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  if v_deleted is null or v_purge <= now() then
    raise exception 'not-restorable' using errcode = '22023';
  end if;

  perform set_config('maha.recycle_op', 'on', true);
  update public.maha_properties
  set deleted_at = null, purge_at = null, deleted_by = null
  where id = p_property_id;
  perform set_config('maha.recycle_op', 'off', true);

  -- only people who were active before: someone switched off individually stays off
  select coalesce(jsonb_agg(distinct m.user_id), '[]'::jsonb) into v_users
  from public.maha_memberships m
  where m.property_id = p_property_id and m.active and m.user_id <> p_owner;

  return jsonb_build_object('property_id', p_property_id, 'property_code', v_code, 'staff_user_ids', v_users);
end;
$$;

-- Erase a hotel that is in the Recycle bin, with everything that belongs to it (records, numbering,
-- invoices register, history, memberships). The organization goes too when it has no other hotel.
-- Returns the staff accounts that now belong to nothing, so the caller can delete those logins.
create or replace function public.maha_purge_hotel(p_owner uuid, p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_org uuid;
  v_deleted timestamptz;
  v_ids uuid[];
  v_orphans jsonb;
begin
  select p.property_code, p.organization_id, p.deleted_at into v_code, v_org, v_deleted
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  if v_deleted is null then
    raise exception 'not-deleted' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct m.user_id), '{}') into v_ids
  from public.maha_memberships m
  where m.property_id = p_property_id and m.user_id <> p_owner
    and not exists (select 1 from public.maha_platform_admins a where a.user_id = m.user_id);

  delete from public.maha_properties where id = p_property_id;

  delete from public.maha_organizations o
  where o.id = v_org and o.owner_user_id = p_owner
    and not exists (select 1 from public.maha_properties p where p.organization_id = v_org);

  select coalesce(jsonb_agg(u), '[]'::jsonb) into v_orphans
  from unnest(v_ids) as u
  where not exists (select 1 from public.maha_memberships m where m.user_id = u);

  return jsonb_build_object('property_code', v_code, 'orphan_user_ids', v_orphans);
end;
$$;

-- Hotels whose 30 days are over (for the provider that owns them).
create or replace function public.maha_recycle_expired(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(p.id), '[]'::jsonb)
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where o.owner_user_id = p_owner and p.deleted_at is not null and p.purge_at <= now();
$$;

-- The Recycle bin as the provider sees it.
create or replace function public.maha_recycle_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'property_id', p.id,
      'property_code', p.property_code,
      'name', p.name,
      'deleted_at', p.deleted_at,
      'purge_at', p.purge_at,
      'deleted_by', i.username,
      'records', (select count(*) from public.maha_records r where r.property_id = p.id and not r.deleted),
      'staff', (select count(*) from public.maha_memberships m where m.property_id = p.id)
    ) order by p.deleted_at desc)
    from public.maha_properties p
    join public.maha_organizations o on o.id = p.organization_id
    left join public.maha_login_identities i on i.user_id = p.deleted_by
    where p.deleted_at is not null and o.owner_user_id = uid
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.maha_recycle_hotel(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.maha_restore_hotel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.maha_purge_hotel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.maha_recycle_expired(uuid) from public, anon, authenticated;
revoke all on function public.maha_recycle_list() from public, anon;
grant execute on function public.maha_recycle_hotel(uuid, uuid, integer) to service_role;
grant execute on function public.maha_restore_hotel(uuid, uuid) to service_role;
grant execute on function public.maha_purge_hotel(uuid, uuid) to service_role;
grant execute on function public.maha_recycle_expired(uuid) to service_role;
grant execute on function public.maha_recycle_list() to authenticated;

commit;
