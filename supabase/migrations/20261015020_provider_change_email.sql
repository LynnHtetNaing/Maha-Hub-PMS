-- Maha Hub: the provider changes the email address of a staff login, and sees the sign-in security of a hotel.
--
-- The sign-in code and the password-reset email go to the address kept on the login (maha_login_identities.recovery_email,
-- the same address as the Supabase Auth user). Staff who lose their mailbox are locked out, so only the provider can
-- change it, through the trusted platform-admin-provision function (service role).
--   * maha_change_staff_email: checks everything, then in ONE transaction writes the new address, forgets every trusted
--     device of that person and ends their sessions. The function then updates the Supabase Auth user and, if that
--     fails, calls this function again with the old address, so nothing stays half-changed.
--   * maha_staff_signin_overview: the staff of one hotel with the masked address and the date of the last code check.
-- Only the service role can run these. Addresses are never written to the activity log.

begin;

-- a***@gmail.com
create or replace function public.maha_mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when position('@' in coalesce(p_email, '')) < 2 then ''
              else left(p_email, 1) || '***' || substring(p_email from position('@' in p_email)) end;
$$;

create or replace function public.maha_change_staff_email(p_owner uuid, p_username text, p_new_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff jsonb := public.maha_owned_staff(p_owner, p_username);   -- staff-not-found (P0002) unless the provider owns this person
  v_user uuid := (v_staff->>'user_id')::uuid;
  v_old text := v_staff->>'recovery_email';
  v_new text := lower(trim(coalesce(p_new_email, '')));
begin
  if exists (select 1 from public.maha_platform_admins a where a.user_id = v_user) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if length(v_new) > 254 or v_new !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid-email' using errcode = '22023';
  end if;
  if exists (select 1 from public.maha_login_identities i where lower(i.recovery_email) = v_new and i.user_id <> v_user)
     or exists (select 1 from auth.users u where lower(u.email) = v_new and u.id <> v_user) then
    raise exception 'email-taken' using errcode = '23505';
  end if;

  update public.maha_login_identities
  set recovery_email = v_new, updated_at = now()
  where user_id = v_user;
  delete from public.maha_trusted_devices where user_id = v_user;
  delete from public.maha_login_challenges where user_id = v_user;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using v_user;   -- ends their other sign-ins
  end if;

  return jsonb_build_object(
    'user_id', v_user,
    'old_email', v_old,
    'new_email', v_new,
    'masked_old', public.maha_mask_email(v_old),
    'masked_new', public.maha_mask_email(v_new)
  );
end;
$$;

-- The staff of one hotel of this provider: masked address and the last time a sign-in code was typed.
create or replace function public.maha_staff_signin_overview(p_owner uuid, p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.maha_properties p
    join public.maha_organizations o on o.id = p.organization_id
    where p.id = p_property_id and o.owner_user_id = p_owner
  ) then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'username', i.username,
             'masked_email', public.maha_mask_email(i.recovery_email),
             'last_verified_at', (select max(d.last_verified_at) from public.maha_trusted_devices d where d.user_id = i.user_id),
             'devices', (select count(*) from public.maha_trusted_devices d where d.user_id = i.user_id)
           ) order by i.username_normalized)
    from public.maha_login_identities i
    where exists (select 1 from public.maha_memberships m where m.user_id = i.user_id and m.property_id = p_property_id)
      and not exists (select 1 from public.maha_platform_admins a where a.user_id = i.user_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.maha_mask_email(text) from public, anon, authenticated;
revoke all on function public.maha_change_staff_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.maha_staff_signin_overview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.maha_mask_email(text) to service_role;
grant execute on function public.maha_change_staff_email(uuid, text, text) to service_role;
grant execute on function public.maha_staff_signin_overview(uuid, uuid) to service_role;

commit;
