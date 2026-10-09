-- Maha Hub: tenant-scoped cloud payload storage with optimistic concurrency.
-- This is an additive foundation. It does not change the current browser sync path.
-- Apply only to a disposable Supabase staging project until integration tests pass.

begin;

create table if not exists public.maha_property_cloud (
  property_id uuid primary key references public.maha_properties(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

create index if not exists maha_property_cloud_updated_at_idx
  on public.maha_property_cloud(updated_at);

alter table public.maha_property_cloud enable row level security;
revoke all on public.maha_property_cloud from public, anon, authenticated;
grant select on public.maha_property_cloud to authenticated;

drop policy if exists maha_property_cloud_select_member on public.maha_property_cloud;
create policy maha_property_cloud_select_member
on public.maha_property_cloud for select to authenticated
using (public.maha_can_access_property(property_id));

-- Walk every object/array and reject payment card data, browser session state,
-- and Stripe secrets before any payload is persisted. Never rely on client scrubbing.
create or replace function public.maha_payload_has_forbidden_keys(node jsonb, parent_key text default '')
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item record;
begin
  if node is null then
    return false;
  end if;

  if jsonb_typeof(node) = 'object' then
    for item in select key, value from jsonb_each(node)
    loop
      if lower(item.key) in ('pan', 'cvc', 'cvv', 'cardvault', 'session') then
        return true;
      end if;
      if lower(item.key) = 'secret' and lower(parent_key) = 'stripe' then
        return true;
      end if;
      if public.maha_payload_has_forbidden_keys(item.value, item.key) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(node) = 'array' then
    for item in select element as key, element as value from jsonb_array_elements(node) as arr(element)
    loop
      if public.maha_payload_has_forbidden_keys(item.value, parent_key) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.maha_payload_has_forbidden_keys(jsonb, text) from public, anon, authenticated;

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
        and o.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.maha_properties p
      join public.maha_memberships m
        on m.organization_id = p.organization_id
       and (m.property_id is null or m.property_id = p.id)
      where p.id = target_property
        and m.user_id = (select auth.uid())
        and m.active
        and m.role <> 'read_only'
    );
$$;

revoke all on function public.maha_can_write_property(uuid) from public, anon;
grant execute on function public.maha_can_write_property(uuid) to authenticated;

create or replace function public.maha_get_property_cloud(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_row public.maha_property_cloud%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_access_property(target_property) then
    raise exception 'property-access-denied' using errcode = '42501';
  end if;

  select * into result_row
  from public.maha_property_cloud
  where property_id = target_property;

  if not found then
    return jsonb_build_object('empty', true, 'version', 0);
  end if;

  return jsonb_build_object(
    'property_id', result_row.property_id,
    'version', result_row.version,
    'updated_at', result_row.updated_at,
    'payload', result_row.payload
  );
end;
$$;

create or replace function public.maha_save_property_cloud(
  target_property uuid,
  new_payload jsonb,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.maha_property_cloud%rowtype;
  saved_row public.maha_property_cloud%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'property-write-denied' using errcode = '42501';
  end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'invalid-payload' using errcode = '22023';
  end if;
  if public.maha_payload_has_forbidden_keys(new_payload) then
    raise exception 'sensitive-data-rejected' using errcode = '22023';
  end if;

  -- First writer creates version 1 only when the client explicitly expects an empty row.
  if coalesce(expected_version, 0) = 0 then
    insert into public.maha_property_cloud(property_id, payload, version, updated_by)
    values (target_property, new_payload, 1, current_user_id)
    on conflict (property_id) do nothing
    returning * into saved_row;

    if found then
      return jsonb_build_object(
        'ok', true, 'version', saved_row.version,
        'updated_at', saved_row.updated_at
      );
    end if;
  end if;

  select * into current_row
  from public.maha_property_cloud
  where property_id = target_property
  for update;

  if not found then
    return jsonb_build_object('conflict', true, 'version', 0, 'empty', true);
  end if;

  if expected_version is null or expected_version <> current_row.version then
    return jsonb_build_object(
      'conflict', true,
      'version', current_row.version,
      'updated_at', current_row.updated_at,
      'payload', current_row.payload
    );
  end if;

  update public.maha_property_cloud
  set payload = new_payload,
      version = current_row.version + 1,
      updated_at = now(),
      updated_by = current_user_id
  where property_id = target_property
  returning * into saved_row;

  return jsonb_build_object(
    'ok', true,
    'version', saved_row.version,
    'updated_at', saved_row.updated_at
  );
end;
$$;

revoke all on function public.maha_get_property_cloud(uuid) from public, anon;
revoke all on function public.maha_save_property_cloud(uuid, jsonb, bigint) from public, anon;
grant execute on function public.maha_get_property_cloud(uuid) to authenticated;
grant execute on function public.maha_save_property_cloud(uuid, jsonb, bigint) to authenticated;

commit;
