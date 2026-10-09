-- Maha Hub: additive tenant identity foundation (migration only).
-- This file intentionally does NOT replace or modify the legacy maha_cloud RPCs.
-- Apply only in a staging Supabase project after reviewing the engineering plan.
-- First organization/membership provisioning must be performed by a trusted server
-- using the service role; never expose the service-role key in the browser.

begin;

create table if not exists public.maha_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.maha_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.maha_organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  property_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, property_code)
);

create table if not exists public.maha_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.maha_organizations(id) on delete cascade,
  property_id uuid references public.maha_properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'org_admin', 'property_admin', 'manager', 'staff', 'read_only')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (role not in ('owner', 'org_admin') or property_id is null),
  unique nulls not distinct (organization_id, property_id, user_id)
);

create index if not exists maha_properties_organization_idx
  on public.maha_properties(organization_id);
create index if not exists maha_memberships_user_active_idx
  on public.maha_memberships(user_id, active);
create index if not exists maha_memberships_org_property_idx
  on public.maha_memberships(organization_id, property_id);

alter table public.maha_organizations enable row level security;
alter table public.maha_properties enable row level security;
alter table public.maha_memberships enable row level security;

revoke all on public.maha_organizations from anon, public;
revoke all on public.maha_properties from anon, public;
revoke all on public.maha_memberships from anon, public;
grant select, insert, update on public.maha_organizations to authenticated;
grant select, insert, update on public.maha_properties to authenticated;
grant select on public.maha_memberships to authenticated;

-- SECURITY DEFINER helpers avoid recursive membership-table RLS checks.
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
  select exists (
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

revoke all on function public.maha_is_org_admin(uuid) from public, anon;
revoke all on function public.maha_can_access_property(uuid) from public, anon;
grant execute on function public.maha_is_org_admin(uuid) to authenticated;
grant execute on function public.maha_can_access_property(uuid) to authenticated;

drop policy if exists maha_organizations_select_member on public.maha_organizations;
create policy maha_organizations_select_member
on public.maha_organizations for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or public.maha_is_org_admin(id)
  or exists (
    select 1 from public.maha_memberships m
    where m.organization_id = id
      and m.user_id = (select auth.uid())
      and m.active
  )
);

drop policy if exists maha_organizations_insert_owner on public.maha_organizations;
create policy maha_organizations_insert_owner
on public.maha_organizations for insert to authenticated
with check (owner_user_id = (select auth.uid()));

drop policy if exists maha_organizations_update_admin on public.maha_organizations;
create policy maha_organizations_update_admin
on public.maha_organizations for update to authenticated
using (owner_user_id = (select auth.uid()) or public.maha_is_org_admin(id))
with check (owner_user_id = (select auth.uid()) or public.maha_is_org_admin(id));

drop policy if exists maha_properties_select_member on public.maha_properties;
create policy maha_properties_select_member
on public.maha_properties for select to authenticated
using (public.maha_can_access_property(id));

drop policy if exists maha_properties_insert_admin on public.maha_properties;
create policy maha_properties_insert_admin
on public.maha_properties for insert to authenticated
with check (public.maha_is_org_admin(organization_id));

drop policy if exists maha_properties_update_admin on public.maha_properties;
create policy maha_properties_update_admin
on public.maha_properties for update to authenticated
using (public.maha_is_org_admin(organization_id))
with check (public.maha_is_org_admin(organization_id));

drop policy if exists maha_memberships_select_self_or_admin on public.maha_memberships;
create policy maha_memberships_select_self_or_admin
on public.maha_memberships for select to authenticated
using (user_id = (select auth.uid()) or public.maha_is_org_admin(organization_id));

-- Membership changes are deliberately not available directly to browser clients.
-- A trusted provisioning service must invite users and create/change memberships.

commit;
