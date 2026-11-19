-- Maha Hub: hotel chains (groups).
--
-- A chain is a company (organization) that holds several hotels and has a code, for example PADAUK2026.
-- A hotel that belongs to no chain stays a company of one, exactly as before.
--   * Only the provider (through the trusted platform-admin-provision function) creates chains, moves hotels
--     between chains, and decides which hotels a person may open.
--   * A person's hotels are only the hotels the provider ticked for that person. Nothing is automatic:
--     a new hotel in a chain is not opened to anyone until the provider ticks it.
--   * All hotels of one person belong to the same chain. Removing access works at once.
--   * The provider reads the whole picture through one gated function.

begin;

alter table public.maha_organizations add column if not exists chain_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maha_organizations_chain_code_format') then
    alter table public.maha_organizations
      add constraint maha_organizations_chain_code_format check (chain_code is null or chain_code ~ '^[A-Z0-9]{6,12}$');
  end if;
end
$$;
create unique index if not exists maha_organizations_chain_code_uq on public.maha_organizations(chain_code) where chain_code is not null;

-- A new chain (a company with a code). Returns its ids.
create or replace function public.maha_create_chain(p_owner uuid, p_name text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_org uuid;
begin
  if length(trim(coalesce(p_name, ''))) not between 2 and 160 or v_code !~ '^[A-Z0-9]{6,12}$' then
    raise exception 'invalid-chain' using errcode = '22023';
  end if;
  if not exists (select 1 from public.maha_platform_admins a where a.user_id = p_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.maha_organizations(name, owner_user_id, chain_code)
  values (trim(p_name), p_owner, v_code)
  returning id into v_org;
  return jsonb_build_object('organization_id', v_org, 'chain_code', v_code, 'name', trim(p_name));
end;
$$;

create or replace function public.maha_rename_chain(p_owner uuid, p_org uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_name, ''))) not between 2 and 160 then
    raise exception 'invalid-chain' using errcode = '22023';
  end if;
  update public.maha_organizations o set name = trim(p_name)
  where o.id = p_org and o.owner_user_id = p_owner and o.chain_code is not null;
  if not found then
    raise exception 'chain-not-found' using errcode = '42501';
  end if;
  return jsonb_build_object('organization_id', p_org, 'name', trim(p_name));
end;
$$;

-- Move a hotel into a chain, or out of any chain (p_target_org null = a company of its own).
create or replace function public.maha_move_hotel(p_owner uuid, p_property_id uuid, p_target_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_deleted timestamptz;
  v_code text;
  v_name text;
  v_target uuid := p_target_org;
begin
  select p.organization_id, p.deleted_at, p.property_code, p.name into v_old, v_deleted, v_code, v_name
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'hotel-deleted' using errcode = '22023';
  end if;
  if v_target is not null then
    if not exists (select 1 from public.maha_organizations o where o.id = v_target and o.owner_user_id = p_owner and o.chain_code is not null) then
      raise exception 'chain-not-found' using errcode = '42501';
    end if;
    if v_target = v_old then
      raise exception 'same-chain' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.maha_organizations o where o.id = v_old and o.chain_code is not null) then
    raise exception 'same-chain' using errcode = '22023';   -- already stand-alone
  end if;

  -- people who work at this hotel and at another hotel of the old chain would be split between two chains
  if exists (
    select 1
    from public.maha_memberships m
    where m.property_id = p_property_id
      and exists (
        select 1 from public.maha_memberships m2
        where m2.user_id = m.user_id and m2.property_id is not null and m2.property_id <> p_property_id
      )
  ) then
    raise exception 'shared-staff' using errcode = '22023';
  end if;

  if v_target is null then
    insert into public.maha_organizations(name, owner_user_id) values (v_name, p_owner) returning id into v_target;
  end if;

  update public.maha_properties set organization_id = v_target where id = p_property_id;
  update public.maha_memberships set organization_id = v_target where property_id = p_property_id;

  -- an old company that is not a chain and has no hotel left goes away; a chain is kept
  delete from public.maha_organizations o
  where o.id = v_old and o.chain_code is null
    and not exists (select 1 from public.maha_properties p where p.organization_id = v_old);

  return jsonb_build_object('property_code', v_code, 'organization_id', v_target);
end;
$$;

-- Allow or stop one person opening one hotel. All hotels of one person belong to one chain.
create or replace function public.maha_set_hotel_access(
  p_owner uuid, p_username text, p_property_id uuid, p_allowed boolean, p_role text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (public.maha_owned_staff(p_owner, p_username)->>'user_id')::uuid;
  v_org uuid;
  v_deleted timestamptz;
  v_role text := case when p_role = 'property_admin' then 'property_admin' else 'staff' end;
  v_hotels jsonb;
begin
  select p.organization_id, p.deleted_at into v_org, v_deleted
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'hotel-deleted' using errcode = '22023';
  end if;

  if coalesce(p_allowed, false) then
    if exists (select 1 from public.maha_memberships m where m.user_id = v_user and m.organization_id <> v_org) then
      raise exception 'different-chain' using errcode = '22023';
    end if;
    insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
    values (v_org, p_property_id, v_user, v_role, true)
    on conflict (organization_id, property_id, user_id) do update set active = true;
  else
    delete from public.maha_memberships m where m.user_id = v_user and m.property_id = p_property_id;
  end if;

  select coalesce(jsonb_agg(p.property_code order by p.property_code), '[]'::jsonb) into v_hotels
  from public.maha_memberships m join public.maha_properties p on p.id = m.property_id
  where m.user_id = v_user and p.deleted_at is null;
  return jsonb_build_object('user_id', v_user, 'hotels', v_hotels);
end;
$$;

-- Keep the company (chain) when its last hotel is erased from the Recycle bin. A plain company of one still goes.
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
  where o.id = v_org and o.owner_user_id = p_owner and o.chain_code is null
    and not exists (select 1 from public.maha_properties p where p.organization_id = v_org);

  select coalesce(jsonb_agg(u), '[]'::jsonb) into v_orphans
  from unnest(v_ids) as u
  where not exists (select 1 from public.maha_memberships m where m.user_id = u);

  return jsonb_build_object('property_code', v_code, 'orphan_user_ids', v_orphans);
end;
$$;

-- The provider's whole picture: chains with their hotels, hotels without a chain, and who may open what.
create or replace function public.maha_access_overview()
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
  return jsonb_build_object(
    'chains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', o.id, 'name', o.name, 'chain_code', o.chain_code,
        'hotels', coalesce((
          select jsonb_agg(jsonb_build_object('property_id', p.id, 'property_code', p.property_code, 'name', p.name) order by p.property_code)
          from public.maha_properties p where p.organization_id = o.id and p.deleted_at is null
        ), '[]'::jsonb)
      ) order by o.chain_code)
      from public.maha_organizations o where o.owner_user_id = uid and o.chain_code is not null
    ), '[]'::jsonb),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object('username', i.username, 'property_code', p.property_code, 'role', m.role, 'active', m.active) order by i.username, p.property_code)
      from public.maha_memberships m
      join public.maha_properties p on p.id = m.property_id and p.deleted_at is null
      join public.maha_organizations o on o.id = p.organization_id and o.owner_user_id = uid
      join public.maha_login_identities i on i.user_id = m.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.maha_create_chain(uuid, text, text) from public, anon, authenticated;
revoke all on function public.maha_rename_chain(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.maha_move_hotel(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.maha_set_hotel_access(uuid, text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.maha_purge_hotel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.maha_access_overview() from public, anon;
grant execute on function public.maha_create_chain(uuid, text, text) to service_role;
grant execute on function public.maha_rename_chain(uuid, uuid, text) to service_role;
grant execute on function public.maha_move_hotel(uuid, uuid, uuid) to service_role;
grant execute on function public.maha_set_hotel_access(uuid, text, uuid, boolean, text) to service_role;
grant execute on function public.maha_purge_hotel(uuid, uuid) to service_role;
grant execute on function public.maha_access_overview() to authenticated;

commit;
