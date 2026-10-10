-- Maha Hub: two-factor gate for the provider (platform owner) session.
--
-- The provider owns every organization, and "owner" access is what lets the provider read and write every
-- hotel. Once the provider has a verified authenticator (TOTP) factor, that owner access is only granted to
-- a session that passed the 6-digit step (JWT claim aal = 'aal2'). A stolen password alone (aal1) then
-- sees no hotels. Hotel staff access (membership based) is not affected.
--
-- Bootstrap: until a factor is enrolled the owner is not gated, so the provider can enrol. Enrolment is
-- forced by the app at the next provider sign-in.
-- Lost phone: remove the factor in the Supabase dashboard (Authentication -> Users -> the user -> MFA).

begin;

-- Does this user have a verified authenticator factor? (service role + used inside the gate below)
create or replace function public.maha_has_verified_mfa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = p_user and f.status = 'verified'
  );
$$;

-- True when the current session may use owner access.
create or replace function public.maha_owner_session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or not public.maha_has_verified_mfa((select auth.uid()));
$$;

revoke all on function public.maha_has_verified_mfa(uuid) from public, anon, authenticated;
revoke all on function public.maha_owner_session_ok() from public, anon, authenticated;
grant execute on function public.maha_has_verified_mfa(uuid) to service_role;

-- Same three helpers as migrations 001/002; only the "organization owner" branch gained the gate.
create or replace function public.maha_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.maha_organizations o
      where o.id = target_org
        and o.owner_user_id = (select auth.uid())
        and public.maha_owner_session_ok()
    )
    or exists (
      select 1
      from public.maha_memberships m
      where m.organization_id = target_org
        and m.user_id = (select auth.uid())
        and m.active
        and m.property_id is null
        and m.role in ('owner', 'org_admin')
    );
$$;

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
        and m.user_id = (select auth.uid())
        and m.active
        and m.role <> 'read_only'
    );
$$;

revoke all on function public.maha_is_org_admin(uuid) from public, anon;
revoke all on function public.maha_can_access_property(uuid) from public, anon;
revoke all on function public.maha_can_write_property(uuid) from public, anon;
grant execute on function public.maha_is_org_admin(uuid) to authenticated;
grant execute on function public.maha_can_access_property(uuid) to authenticated;
grant execute on function public.maha_can_write_property(uuid) to authenticated;

commit;
