-- Maha Sales (company CRM): its own sales team.
--
-- The Maha Hub sales team signs in to the company Sales (crm.maha-hub.com) with a username, a password and the emailed code on a new device,
-- the same sign-in service as the PMS. A team member is NOT a hotel user and has no hotel: the only thing a member can open is the company Sales records.
--   * maha_crm_members lists the team (added and switched off by the provider, from the Provider console).
--   * Everyone on the active team sees all company Sales records (no roles, no hotels). The provider (platform admin) can too.
--   * A hotel's people, a switched-off member and anonymous visitors can never read or write them.
-- NOT APPLIED YET. Run it on the staging project first, then on the main project, only after the owner says yes.
-- Needs 20261105_032_sales_records.sql first.

begin;

create table if not exists public.maha_crm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.maha_crm_members enable row level security;
revoke all on public.maha_crm_members from public, anon, authenticated;
grant select on public.maha_crm_members to authenticated;   -- changes go only through the trusted server (service role)

drop policy if exists maha_crm_members_select on public.maha_crm_members;
create policy maha_crm_members_select on public.maha_crm_members for select to authenticated
using (user_id = (select auth.uid()) or public.maha_is_platform_admin());

create or replace function public.maha_is_crm_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_crm_members m
    where m.user_id = (select auth.uid()) and m.active
  );
$$;
revoke all on function public.maha_is_crm_member() from public, anon;
grant execute on function public.maha_is_crm_member() to authenticated;

-- the company Sales records: the active team and the provider
drop policy if exists maha_sales_records_select on public.maha_sales_records;
create policy maha_sales_records_select on public.maha_sales_records for select to authenticated
using (public.maha_is_platform_admin() or public.maha_is_crm_member());

drop policy if exists maha_sales_records_insert on public.maha_sales_records;
create policy maha_sales_records_insert on public.maha_sales_records for insert to authenticated
with check (public.maha_is_platform_admin() or public.maha_is_crm_member());

drop policy if exists maha_sales_records_update on public.maha_sales_records;
create policy maha_sales_records_update on public.maha_sales_records for update to authenticated
using (public.maha_is_platform_admin() or public.maha_is_crm_member())
with check (public.maha_is_platform_admin() or public.maha_is_crm_member());

commit;
