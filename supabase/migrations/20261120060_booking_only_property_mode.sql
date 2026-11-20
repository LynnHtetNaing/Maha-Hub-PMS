-- Maha Booking-only properties.
-- Keep the existing tenant/property identity model, but record which primary product
-- the property was provisioned for. A Booking-only property can still use the shared
-- cloud records and Booking Engine services without opening Maha PMS for its users.

begin;

alter table public.maha_properties
  add column if not exists product_mode text not null default 'pms';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maha_properties_product_mode'
  ) then
    alter table public.maha_properties
      add constraint maha_properties_product_mode
      check (product_mode in ('pms', 'booking_only'));
  end if;
end
$$;

create or replace function public.maha_provision_hotel_v2(
  p_org_id uuid,
  p_org_name text,
  p_owner uuid,
  p_property_name text,
  p_property_code text,
  p_user_id uuid,
  p_username text,
  p_email text,
  p_role text,
  p_product_mode text
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
  if p_product_mode not in ('pms', 'booking_only') then
    raise exception 'invalid-product-mode' using errcode = '22023';
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

  insert into public.maha_properties(organization_id, name, property_code, product_mode)
  values (v_org, p_property_name, upper(p_property_code), p_product_mode)
  returning id into v_prop;

  insert into public.maha_login_identities(user_id, username, recovery_email)
  values (p_user_id, p_username, p_email);

  insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
  values (v_org, v_prop, p_user_id, p_role, true);

  return jsonb_build_object(
    'organization_id', v_org,
    'property_id', v_prop,
    'product_mode', p_product_mode
  );
end;
$$;

revoke all on function public.maha_provision_hotel_v2(uuid, text, uuid, text, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maha_provision_hotel_v2(uuid, text, uuid, text, text, uuid, text, text, text, text)
  to service_role;

commit;
