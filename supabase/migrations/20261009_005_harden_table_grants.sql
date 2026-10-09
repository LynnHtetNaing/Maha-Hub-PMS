-- Maha Hub: restore the table privileges migrations 001/002 intended.
--
-- Found on staging: Supabase default privileges had already granted ALL (including DELETE and
-- TRUNCATE) on the tenant tables to `authenticated`, and migration 001 only revoked from
-- anon/public. RLS limits INSERT/UPDATE/DELETE, but TRUNCATE ignores RLS, so any signed-in user
-- could empty maha_organizations / maha_properties / maha_memberships (and cascade to
-- maha_property_cloud). This migration revokes everything, then grants back only the intended set.
--
-- Also drops two policies that exist only on staging (applied outside the repo as
-- "tenant_cloud_write_access"). They let any member, including read_only, write
-- maha_property_cloud directly and bypass maha_can_write_property() and the forbidden-key check.
-- Cloud writes go through maha_save_property_cloud() only.

begin;

revoke all on public.maha_organizations from public, anon, authenticated;
revoke all on public.maha_properties from public, anon, authenticated;
revoke all on public.maha_memberships from public, anon, authenticated;
revoke all on public.maha_property_cloud from public, anon, authenticated;
revoke all on public.maha_login_identities from public, anon, authenticated;
revoke all on public.maha_platform_admins from public, anon, authenticated;

grant select, insert on public.maha_organizations to authenticated;
grant update (name) on public.maha_organizations to authenticated;
grant select, insert, update on public.maha_properties to authenticated;
grant select on public.maha_memberships to authenticated;
grant select on public.maha_property_cloud to authenticated;

drop policy if exists maha_property_cloud_insert_member on public.maha_property_cloud;
drop policy if exists maha_property_cloud_update_member on public.maha_property_cloud;

commit;
