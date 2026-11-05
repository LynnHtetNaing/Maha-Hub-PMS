-- Maha Sales (company CRM): what only the provider (the CEO) may write is enforced by the database, not only by the screens.
--   * The prices and fees (comodule), the staff credit % (staffcr), the referral rewards (refplan), the System Providers (sysprov) and the Playbook (pbcard)
--     can be written only by the provider (a platform admin). A team member who tries gets "provider-only" (42501), even with a changed page.
--   * A discount approval: only the provider can set a quotation's approval to approved or declined; a team member can ask (requested) and keep an approval
--     that is already there.
-- The trusted server (service role) is not affected. Additive. NOT APPLIED YET: staging first, then live, only after the owner says yes.
-- Needs 20261105_032_sales_records.sql and 20261105_033_crm_team.sql first.

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
  if new.kind in ('comodule', 'staffcr', 'refplan', 'sysprov', 'pbcard', 'actcredit', 'techuser') then
    if v_exists and new.data is not distinct from v_old and new.deleted is not distinct from v_old_deleted then return new; end if;   -- nothing changed
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
