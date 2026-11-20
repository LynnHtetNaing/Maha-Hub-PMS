-- Booking-only properties share the existing public Booking Engine catalogue and inventory records,
-- but do not require a PMS staff account or a PMS subscription/login.
begin;

alter table public.maha_properties
  add column if not exists product_mode text not null default 'pms';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maha_properties_product_mode') then
    alter table public.maha_properties
      add constraint maha_properties_product_mode
      check (product_mode in ('pms', 'booking_only'));
  end if;
end
$$;

create or replace function public.maha_provision_booking_only(
  p_org_id uuid,
  p_org_name text,
  p_owner uuid,
  p_property_name text,
  p_property_code text
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
  if p_owner is null
     or p_property_name is null or length(trim(p_property_name)) < 2 or length(trim(p_property_name)) > 160
     or p_property_code is null or upper(trim(p_property_code)) !~ '^[A-Z0-9_-]{2,24}$' then
    raise exception 'invalid-fields' using errcode = '22023';
  end if;

  if p_org_id is null then
    if p_org_name is null or length(trim(p_org_name)) < 2 or length(trim(p_org_name)) > 160 then
      raise exception 'invalid-organization' using errcode = '22023';
    end if;
    insert into public.maha_organizations(name, owner_user_id)
    values (trim(p_org_name), p_owner)
    returning id into v_org;
  else
    select id into v_org
    from public.maha_organizations
    where id = p_org_id and owner_user_id = p_owner;
    if not found then
      raise exception 'organization-not-owned' using errcode = '42501';
    end if;
  end if;

  insert into public.maha_properties(organization_id, name, property_code, product_mode)
  values (v_org, trim(p_property_name), upper(trim(p_property_code)), 'booking_only')
  returning id into v_prop;

  return jsonb_build_object('organization_id', v_org, 'property_id', v_prop, 'product_mode', 'booking_only');
end;
$$;

revoke all on function public.maha_provision_booking_only(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.maha_provision_booking_only(uuid, text, uuid, text, text)
  to service_role;

commit;
