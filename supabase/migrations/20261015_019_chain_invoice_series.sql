-- Maha Hub: a chain chooses how its tax-invoice numbers run.
--   'hotel' (the default, as before): every hotel has its own series, TIV-H1-2026-10-0001, TIV-H2-2026-10-0001 ...
--   'chain': ONE series for all hotels of the chain. The hotel code stays in front, the 4-digit number of the month is
--            shared and strictly consecutive across the chain: TIV-H1-2026-10-0001, TIV-H2-2026-10-0002, TIV-H1-2026-10-0003 ...
-- Only the provider changes the choice (trusted platform-admin-provision function). Switching never rewinds a number:
--   * the chain counter always starts from the highest number any hotel of the chain has already used, and
--   * every number taken from the chain counter is also written into the hotel's own counter,
-- so going back to one series per hotel, or moving a hotel in or out of the chain, can never repeat a printed number.
-- The overall audit number (maha_invoice_register) stays one list per hotel, so the provider's audit keeps working.

begin;

alter table public.maha_organizations add column if not exists invoice_scope text not null default 'hotel';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maha_organizations_invoice_scope_check') then
    alter table public.maha_organizations
      add constraint maha_organizations_invoice_scope_check check (invoice_scope in ('hotel', 'chain'));
  end if;
end
$$;

-- Counters that belong to a whole chain (service only, like maha_counters).
create table if not exists public.maha_org_counters (
  organization_id uuid not null references public.maha_organizations(id) on delete cascade,
  counter text not null check (counter ~ '^[A-Za-z0-9_]{1,40}$'),
  next_value bigint not null check (next_value > 0),
  primary key (organization_id, counter)
);
alter table public.maha_org_counters enable row level security;
revoke all on public.maha_org_counters from public, anon, authenticated;

create or replace function public.maha_issue_invoice_ref(target_property uuid, p_ym text, floor_no bigint, floor_seq bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  s bigint;
  month_counter text;
  v_org uuid;
  v_scope text;
  v_seed bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'property-write-denied' using errcode = '42501';
  end if;
  if p_ym is null or p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid-month' using errcode = '22023';
  end if;
  month_counter := 'invoice_m_' || replace(p_ym, '-', '');   -- counter names allow only letters, digits and _

  -- overall number: always this hotel's own list (same counter and register as maha_issue_invoice_no)
  insert into public.maha_counters(property_id, counter, next_value)
  values (target_property, 'invoice_gapless', greatest(coalesce(floor_no, 1), 1))
  on conflict (property_id, counter)
  do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
  update public.maha_counters
  set next_value = next_value + 1
  where property_id = target_property and counter = 'invoice_gapless'
  returning next_value - 1 into n;
  insert into public.maha_invoice_register(property_id, no, issued_by)
  values (target_property, n, (select auth.uid()));

  -- the chain's choice. For a chain series the company row is locked, so two hotels never take the same number.
  select p.organization_id into v_org from public.maha_properties p where p.id = target_property;
  select o.invoice_scope into v_scope from public.maha_organizations o where o.id = v_org;
  if v_scope = 'chain' then
    select o.invoice_scope into v_scope from public.maha_organizations o where o.id = v_org for update;
  end if;

  if v_scope = 'chain' then
    -- start from the highest number any hotel of the chain already used this month, never lower
    select max(c.next_value) into v_seed
    from public.maha_counters c
    join public.maha_properties p on p.id = c.property_id
    where p.organization_id = v_org and c.counter = month_counter;
    insert into public.maha_org_counters(organization_id, counter, next_value)
    values (v_org, month_counter, greatest(coalesce(v_seed, 1), coalesce(floor_seq, 1), 1))
    on conflict (organization_id, counter)
    do update set next_value = greatest(public.maha_org_counters.next_value, excluded.next_value);
    update public.maha_org_counters
    set next_value = next_value + 1
    where organization_id = v_org and counter = month_counter
    returning next_value - 1 into s;
    -- remember it in the hotel's own counter too, so a later switch back can never repeat it
    insert into public.maha_counters(property_id, counter, next_value)
    values (target_property, month_counter, s + 1)
    on conflict (property_id, counter)
    do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
  else
    insert into public.maha_counters(property_id, counter, next_value)
    values (target_property, month_counter, greatest(coalesce(floor_seq, 1), 1))
    on conflict (property_id, counter)
    do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
    update public.maha_counters
    set next_value = next_value + 1
    where property_id = target_property and counter = month_counter
    returning next_value - 1 into s;
  end if;

  return jsonb_build_object('no', n, 'seq', s, 'ym', p_ym, 'scope', coalesce(v_scope, 'hotel'));
end;
$$;

-- Provider only (through the trusted function): choose the series for one chain. Counters are not touched.
create or replace function public.maha_set_invoice_scope(p_owner uuid, p_org uuid, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_scope is null or p_scope not in ('hotel', 'chain') then
    raise exception 'invalid-scope' using errcode = '22023';
  end if;
  if not exists (select 1 from public.maha_platform_admins a where a.user_id = p_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select o.invoice_scope into v_old
  from public.maha_organizations o
  where o.id = p_org and o.owner_user_id = p_owner and o.chain_code is not null
  for update;
  if not found then
    raise exception 'chain-not-found' using errcode = '42501';
  end if;
  update public.maha_organizations set invoice_scope = p_scope where id = p_org;
  return jsonb_build_object('organization_id', p_org, 'invoice_scope', p_scope, 'changed', v_old <> p_scope);
end;
$$;

-- The provider's picture now also tells each chain's choice.
create or replace function public.maha_access_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'chains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', o.id, 'name', o.name, 'chain_code', o.chain_code, 'invoice_scope', o.invoice_scope,
        'hotels', coalesce((
          select jsonb_agg(jsonb_build_object('property_id', p.id, 'property_code', p.property_code, 'name', p.name) order by p.property_code)
          from public.maha_properties p where p.organization_id = o.id and p.deleted_at is null
        ), '[]'::jsonb)
      ) order by o.chain_code)
      from public.maha_organizations o where o.owner_user_id = uid and o.chain_code is not null
    ), '[]'::jsonb),
    'access', coalesce((
      select jsonb_agg(jsonb_build_object('username', i.username, 'property_code', p.property_code, 'role', m.role, 'active', m.active) order by i.username, p.property_code)
      from public.maha_memberships m
      join public.maha_properties p on p.id = m.property_id and p.deleted_at is null
      join public.maha_organizations o on o.id = p.organization_id and o.owner_user_id = uid
      join public.maha_login_identities i on i.user_id = m.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.maha_issue_invoice_ref(uuid, text, bigint, bigint) from public, anon;
grant execute on function public.maha_issue_invoice_ref(uuid, text, bigint, bigint) to authenticated;
revoke all on function public.maha_set_invoice_scope(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.maha_set_invoice_scope(uuid, uuid, text) to service_role;
revoke all on function public.maha_access_overview() from public, anon;
grant execute on function public.maha_access_overview() to authenticated;

commit;
