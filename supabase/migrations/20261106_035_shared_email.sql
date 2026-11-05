-- Maha Hub: one email address can have a login in more than one system (PMS, Provider console, CRM, ...).
--
-- Supabase Auth allows one account per email address. When an address is already used by another login, the new login gets a private
-- sign-in address of its own (auth_email, like u-<random>@accounts.maha-hub.invalid) that nobody can receive mail on, and the real address
-- stays in recovery_email. Every sign-in code and set-password email is sent to recovery_email (the auth-email-hook function looks it up).
-- Logins made before this keep auth_email empty: their Supabase Auth address is their real address, as always.
--   * maha_login_identities.auth_email   the address Supabase Auth knows this login by, only when it is not the real one.
--   * maha_change_staff_email            no longer refuses an address another login already uses (the function gives such a login its own
--                                        private address when Supabase Auth would refuse the real one).
-- Additive. NOT APPLIED YET: staging first, then live, only after the owner says yes.

begin;

alter table public.maha_login_identities add column if not exists auth_email text;
alter table public.maha_login_identities drop constraint if exists maha_login_auth_email_format;
alter table public.maha_login_identities add constraint maha_login_auth_email_format check (
  auth_email is null or (length(trim(auth_email)) between 5 and 254 and position('@' in auth_email) > 1)
);
create unique index if not exists maha_login_auth_email_uq on public.maha_login_identities (lower(auth_email)) where auth_email is not null;

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

revoke all on function public.maha_change_staff_email(uuid, text, text) from public, anon, authenticated;
grant execute on function public.maha_change_staff_email(uuid, text, text) to service_role;

commit;
