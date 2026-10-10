-- Maha Hub: fixes from the Supabase security + performance advisors.
--
-- Security: Supabase's own event-trigger helper rls_auto_enable() was executable through the web API
-- (anon / authenticated). Event triggers do not need that privilege, so remove it.
-- Performance: four foreign keys had no covering index.
--
-- Deliberately NOT changed (accepted, by design): the maha_* functions that signed-in users can execute
-- (sync, number leases, access helpers). Row-level-security policies call the access helpers as the
-- signed-in user, and every RPC checks the caller's access itself.

begin;

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'rls_auto_enable') then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

create index if not exists maha_memberships_property_idx on public.maha_memberships(property_id);
create index if not exists maha_organizations_owner_idx on public.maha_organizations(owner_user_id);
create index if not exists maha_property_cloud_updated_by_idx on public.maha_property_cloud(updated_by);
create index if not exists maha_records_updated_by_idx on public.maha_records(updated_by);

commit;
