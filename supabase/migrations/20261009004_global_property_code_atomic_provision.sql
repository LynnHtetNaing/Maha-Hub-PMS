-- Maha Hub: globally unique property codes + atomic hotel provisioning.
-- Additive. Apply to STAGING first. Never apply to the legacy project (wragaoglvksbbgmfjyzp).
--
-- 1. Property codes were only unique per organization, but staff sign-in and the
--    tenant-cloud function resolve a property by code. Make codes globally unique
--    (case-insensitive) and well-formed so a code can never match two hotels.
-- 2. platform-admin-provision wrote organization, property, identity and membership in
--    four separate calls and tried to undo them by hand. maha_provision_hotel() does all
--    four in ONE transaction, so a failure leaves nothing behind.

begin;

do $$
begin
  if exists (
    select 1 from public.maha_properties
    where property_code is not null
    group by upper(property_code) having count(*) > 1
  ) then
    raise exception 'duplicate property codes exist; resolve them before applying this migration';
  end if;
  if exists (
    select 1 from public.maha_properties
    where property_code is not null and upper(property_code) !~ '^[A-Z0-9_-]{2,24}$'
  ) then
    raise exception 'malformed property codes exist; resolve them before applying this migration';
  end if;
end
$$;

create unique index if not exists maha_properties_code_global_uq
  on public.maha_properties (upper(property_code))
  where property_code is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maha_properties_code_format') then
    alter table public.maha_properties
      add constraint maha_properties_code_format
      check (property_code is null or upper(property_code) ~ '^[A-Z0-9_-]{2,24}$');
  end if;
end
$$;

create or replace function public.maha_provision_hotel(
  p_org_id uuid,
  p_org_name text,
  p_owner uuid,
  p_property_name text,
  p_property_code text,
  p_user_id uuid,
  p_username text,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_prop uuid;
begin
  if p_role not in ('property_admin', 'staff') then
    raise exception 'invalid-role' using errcode = '22023';
  end if;

  if p_org_id is null then
    insert into public.maha_organizations(name, owner_user_id)
    values (p_org_name, p_owner)
    returning id into v_org;
  else
    select id into v_org
    from public.maha_organizations
    where id = p_org_id and owner_user_id = p_owner;
    if not found then
      raise exception 'organization-not-owned' using errcode = '42501';
    end if;
  end if;

  insert into public.maha_properties(organization_id, name, property_code)
  values (v_org, p_property_name, upper(p_property_code))
  returning id into v_prop;

  insert into public.maha_login_identities(user_id, username, recovery_email)
  values (p_user_id, p_username, p_email);

  insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
  values (v_org, v_prop, p_user_id, p_role, true);

  return jsonb_build_object('organization_id', v_org, 'property_id', v_prop);
end;
$$;

-- Callable only by the trusted server (service role). Browser roles can never provision.
revoke all on function public.maha_provision_hotel(uuid, text, uuid, text, text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maha_provision_hotel(uuid, text, uuid, text, text, uuid, text, text, text)
  to service_role;

commit;
