-- Maha Hub: provider-only staff administration.
-- Hotel managers and owners cannot create or manage logins; only the platform owner (provider) can,
-- through the trusted platform-admin-provision function (service role). Every function here takes the
-- calling provider's user id and refuses anything outside organizations that provider owns.

begin;

-- The staff account (login identity) of a member of an organization owned by p_owner.
create or replace function public.maha_owned_staff(p_owner uuid, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select i.user_id, i.recovery_email into r
  from public.maha_login_identities i
  where i.username_normalized = lower(trim(p_username))
    and exists (
      select 1
      from public.maha_memberships m
      join public.maha_organizations o on o.id = m.organization_id
      where m.user_id = i.user_id and o.owner_user_id = p_owner
    );
  if not found then
    raise exception 'staff-not-found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('user_id', r.user_id, 'recovery_email', r.recovery_email);
end;
$$;

-- Add one staff login to a property in an organization the provider owns (one transaction).
create or replace function public.maha_provision_staff(
  p_property_id uuid,
  p_owner uuid,
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
begin
  if p_role not in ('property_admin', 'staff') then
    raise exception 'invalid-role' using errcode = '22023';
  end if;
  select p.organization_id into v_org
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property_id and o.owner_user_id = p_owner;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;

  insert into public.maha_login_identities(user_id, username, recovery_email)
  values (p_user_id, p_username, p_email);
  insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
  values (v_org, p_property_id, p_user_id, p_role, true);

  return jsonb_build_object('organization_id', v_org, 'property_id', p_property_id);
end;
$$;

-- Enable or disable a staff member's access to the provider's hotels. Returns the auth user id so the
-- caller can also ban/unban the auth account.
create or replace function public.maha_set_staff_active(p_owner uuid, p_username text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (public.maha_owned_staff(p_owner, p_username)->>'user_id')::uuid;
begin
  update public.maha_memberships m
  set active = coalesce(p_active, false)
  where m.user_id = v_user
    and m.organization_id in (select o.id from public.maha_organizations o where o.owner_user_id = p_owner);
  return v_user;
end;
$$;

create or replace function public.maha_rename_staff(p_owner uuid, p_username text, p_new_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (public.maha_owned_staff(p_owner, p_username)->>'user_id')::uuid;
begin
  update public.maha_login_identities
  set username = p_new_username, updated_at = now()
  where user_id = v_user;
  return v_user;
end;
$$;

revoke all on function public.maha_owned_staff(uuid, text) from public, anon, authenticated;
revoke all on function public.maha_provision_staff(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.maha_set_staff_active(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.maha_rename_staff(uuid, text, text) from public, anon, authenticated;
grant execute on function public.maha_owned_staff(uuid, text) to service_role;
grant execute on function public.maha_provision_staff(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.maha_set_staff_active(uuid, text, boolean) to service_role;
grant execute on function public.maha_rename_staff(uuid, text, text) to service_role;

commit;
