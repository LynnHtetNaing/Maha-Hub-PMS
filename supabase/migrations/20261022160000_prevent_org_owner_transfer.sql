-- Prevent organization ownership transfer through browser-facing table updates.
-- Ownership transfer, if ever required, must be implemented as a separate reviewed workflow.
create or replace function public.maha_prevent_org_owner_change()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'organization-owner-change-not-allowed' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.maha_prevent_org_owner_change() from public, anon, authenticated;

drop trigger if exists maha_organizations_owner_immutable on public.maha_organizations;
create trigger maha_organizations_owner_immutable
before update of owner_user_id on public.maha_organizations
for each row execute function public.maha_prevent_org_owner_change();
