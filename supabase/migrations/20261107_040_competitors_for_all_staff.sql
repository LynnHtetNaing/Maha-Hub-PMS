-- Maha Sales (company CRM): every sales staff member can add and edit the competitors (system providers, kind 'sysprov').
--
-- Until now the competitors could be written only by the provider (the CEO). The sales staff are the ones who call the hotels and learn about the competitors,
-- so from now on any CRM member can add a competitor and edit its profile and its analysis. Only the provider can DELETE one (a deletion is a record marked deleted):
-- a team member who tries gets "provider-only" (42501), even with a changed page. Everything else that was provider-only stays provider-only.
-- Replaces the guard of 20261106_036 (the competitor profiles of 037, if it was applied, are no longer used). Additive. NOT APPLIED YET: staging first, then live, only after the owner says yes.
-- Needs 20261106_036_sales_provider_only.sql first.

begin;

create or replace function public.maha_sales_records_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_old_deleted boolean;
  v_exists boolean;
begin
  if (select auth.uid()) is null then return new; end if;        -- the trusted server
  if public.maha_is_platform_admin() then return new; end if;    -- the provider
  -- the CRM saves with an upsert, which reaches this trigger as an insert even for a record that exists: compare with the stored record
  select r.data, r.deleted into v_old, v_old_deleted from public.maha_sales_records r where r.id = new.id;
  v_exists := found;
  if new.kind in ('comodule', 'staffcr', 'refplan', 'pbcard', 'actcredit', 'techuser', 'compprof') then
    if v_exists and new.data is not distinct from v_old and new.deleted is not distinct from v_old_deleted then return new; end if;   -- nothing changed
    raise exception 'provider-only' using errcode = '42501';
  end if;
  -- a competitor: everyone in the team adds and edits; only the provider deletes (or brings back) one
  if new.kind = 'sysprov' and new.deleted is distinct from case when v_exists then v_old_deleted else false end then
    raise exception 'provider-only' using errcode = '42501';
  end if;
  if new.kind = 'quote'
     and coalesce(new.data->>'approval', '') in ('approved', 'declined')
     and coalesce(new.data->>'approval', '') is distinct from coalesce(case when v_exists then v_old->>'approval' end, '') then
    raise exception 'provider-only' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists maha_sales_records_guard on public.maha_sales_records;
create trigger maha_sales_records_guard before insert or update on public.maha_sales_records
for each row execute function public.maha_sales_records_guard();

revoke all on function public.maha_sales_records_guard() from public, anon, authenticated;

commit;
