-- Maha Hub: "Tax Invoice Reference" - each hotel uses the Standard tax invoice number (TIV-hotel code-year-month-4 digits, as before)
-- or a Manual format that the provider types ONCE while setting the hotel up: a prefix (e.g. INV- or TAX/2026/), a starting number,
-- the minimum number of digits (zero padding) and whether the digits may grow without limit.
--
-- After that the server numbers every new invoice by itself, strictly consecutive (gapless):
--   * one series for the hotel (its own counter), or
--   * one series for the whole chain when the chain's choice (invoice_scope, migration 019) is 'chain'. Then the prefix, starting number
--     and digits are typed once for the chain (kept on the chain's row) and all hotels of the chain share one counter.
-- Nothing is ever rewound: a counter only moves up, a starting number can never be lower than the highest number already issued, and every
-- number taken from the chain counter is also written into the hotel's own counter, so a later switch can never repeat a printed number.
-- The old functions (maha_issue_invoice_ref, maha_issue_invoice_no) stay as they are. maha_issue_invoice_number is the new entry point: for a
-- hotel in Standard mode it simply calls maha_issue_invoice_ref, so Standard output is exactly as before.
-- Invoices already printed are never touched (the page stores each reference on the invoice).

begin;

alter table public.maha_properties add column if not exists invoice_mode text not null default 'standard';
alter table public.maha_properties add column if not exists invoice_prefix text;
alter table public.maha_properties add column if not exists invoice_start bigint;
alter table public.maha_properties add column if not exists invoice_min_digits integer;
alter table public.maha_properties add column if not exists invoice_unlimited boolean;
alter table public.maha_organizations add column if not exists invoice_prefix text;
alter table public.maha_organizations add column if not exists invoice_start bigint;
alter table public.maha_organizations add column if not exists invoice_min_digits integer;
alter table public.maha_organizations add column if not exists invoice_unlimited boolean;

do $$
declare t text;
begin
  foreach t in array array['maha_properties', 'maha_organizations'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_invoice_format_check') then
      execute format('alter table public.%I add constraint %I check (
        (invoice_prefix is null or invoice_prefix ~ %L)
        and (invoice_start is null or invoice_start >= 1)
        and (invoice_min_digits is null or invoice_min_digits between 1 and 12))',
        t, t || '_invoice_format_check', '^[A-Za-z0-9_/.-]{0,20}$');
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'maha_properties_invoice_mode_check') then
    alter table public.maha_properties add constraint maha_properties_invoice_mode_check check (invoice_mode in ('standard', 'manual'));
  end if;
end
$$;

-- New entry point used by the page for gapless hotels.
create or replace function public.maha_issue_invoice_number(target_property uuid, p_ym text, floor_no bigint, floor_seq bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_mode text;
  v_scope text;
  v_chain text;
  v_prefix text;
  v_start bigint;
  v_min integer;
  v_unl boolean;
  n bigint;
  s bigint;
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

  select p.organization_id, p.invoice_mode into v_org, v_mode from public.maha_properties p where p.id = target_property;
  if v_mode is distinct from 'manual' then
    return public.maha_issue_invoice_ref(target_property, p_ym, floor_no, floor_seq) || jsonb_build_object('mode', 'standard');
  end if;

  -- Manual. For a chain series the company row is locked, so two hotels never take the same number.
  select o.invoice_scope, o.chain_code into v_scope, v_chain from public.maha_organizations o where o.id = v_org;
  if v_scope = 'chain' and v_chain is not null then
    select o.invoice_prefix, o.invoice_start, o.invoice_min_digits, o.invoice_unlimited
      into v_prefix, v_start, v_min, v_unl
    from public.maha_organizations o where o.id = v_org for update;
  else
    v_scope := 'hotel';
    select p.invoice_prefix, p.invoice_start, p.invoice_min_digits, p.invoice_unlimited
      into v_prefix, v_start, v_min, v_unl
    from public.maha_properties p where p.id = target_property;
  end if;
  if v_start is null or v_min is null or v_unl is null then
    raise exception 'invoice-format-missing' using errcode = 'P0001';
  end if;

  -- overall number: this hotel's own list (same counter and register as maha_issue_invoice_ref)
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

  if v_scope = 'chain' then
    select max(c.next_value) into v_seed
    from public.maha_counters c
    join public.maha_properties p on p.id = c.property_id
    where p.organization_id = v_org and c.counter = 'invoice_manual';
    insert into public.maha_org_counters(organization_id, counter, next_value)
    values (v_org, 'invoice_manual', greatest(coalesce(v_seed, 1), coalesce(floor_seq, 1), v_start, 1))
    on conflict (organization_id, counter)
    do update set next_value = greatest(public.maha_org_counters.next_value, excluded.next_value);
    update public.maha_org_counters
    set next_value = next_value + 1
    where organization_id = v_org and counter = 'invoice_manual'
    returning next_value - 1 into s;
    insert into public.maha_counters(property_id, counter, next_value)
    values (target_property, 'invoice_manual', s + 1)
    on conflict (property_id, counter)
    do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
  else
    insert into public.maha_counters(property_id, counter, next_value)
    values (target_property, 'invoice_manual', greatest(coalesce(floor_seq, 1), v_start, 1))
    on conflict (property_id, counter)
    do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
    update public.maha_counters
    set next_value = next_value + 1
    where property_id = target_property and counter = 'invoice_manual'
    returning next_value - 1 into s;
  end if;

  -- fixed width: when the number needs more digits than allowed, nothing is issued (everything above is rolled back)
  if not v_unl and length(s::text) > v_min then
    raise exception 'invoice-numbers-used-up' using errcode = 'P0001';
  end if;

  return jsonb_build_object('no', n, 'mseq', s, 'ym', p_ym, 'scope', v_scope, 'mode', 'manual',
    'ref', v_prefix || lpad(s::text, v_min, '0'));
end;
$$;

-- Provider only (through the trusted function): choose Standard or Manual for one hotel and, for Manual, the format.
-- The format is kept on the chain when that chain has one series, otherwise on the hotel.
create or replace function public.maha_set_invoice_format(
  p_owner uuid, p_property uuid, p_mode text, p_prefix text, p_start bigint, p_min_digits integer, p_unlimited boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_scope text;
  v_chain text;
  v_issued bigint;
  v_on_chain boolean;
begin
  if p_mode is null or p_mode not in ('standard', 'manual') then
    raise exception 'invalid-format' using errcode = '22023';
  end if;
  if not exists (select 1 from public.maha_platform_admins a where a.user_id = p_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.organization_id into v_org
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id
  where p.id = p_property and o.owner_user_id = p_owner and p.deleted_at is null
  for update of p;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  select o.invoice_scope, o.chain_code into v_scope, v_chain from public.maha_organizations o where o.id = v_org;
  v_on_chain := v_scope = 'chain' and v_chain is not null;

  if p_mode = 'manual' then
    if p_prefix is null or p_prefix !~ '^[A-Za-z0-9_/.-]{0,20}$'
       or p_start is null or p_start < 1
       or p_min_digits is null or p_min_digits < 1 or p_min_digits > 12
       or p_unlimited is null then
      raise exception 'invalid-format' using errcode = '22023';
    end if;
    -- never lower than the highest number already issued (for a chain: by any hotel of the chain)
    select coalesce(max(c.next_value), 1) - 1 into v_issued
    from public.maha_counters c
    join public.maha_properties p on p.id = c.property_id
    where c.counter = 'invoice_manual'
      and ((v_on_chain and p.organization_id = v_org) or (not v_on_chain and p.id = p_property));
    if v_on_chain then
      select greatest(v_issued, coalesce((select oc.next_value from public.maha_org_counters oc
        where oc.organization_id = v_org and oc.counter = 'invoice_manual'), 1) - 1) into v_issued;
    end if;
    if p_start < v_issued then
      raise exception 'start-too-low' using errcode = '22023';
    end if;
    if v_on_chain then
      update public.maha_organizations
      set invoice_prefix = p_prefix, invoice_start = p_start, invoice_min_digits = p_min_digits, invoice_unlimited = p_unlimited
      where id = v_org;
    else
      update public.maha_properties
      set invoice_prefix = p_prefix, invoice_start = p_start, invoice_min_digits = p_min_digits, invoice_unlimited = p_unlimited
      where id = p_property;
    end if;
  end if;
  update public.maha_properties set invoice_mode = p_mode where id = p_property;
  return jsonb_build_object('property_id', p_property, 'invoice_mode', p_mode, 'on_chain', v_on_chain);
end;
$$;

-- What the provider's page shows for one hotel: the mode, the series and the format in use, and the next number.
create or replace function public.maha_invoice_format_of(p_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_org uuid;
  v_mode text;
  v_scope text;
  v_chain text;
  v_prefix text;
  v_start bigint;
  v_min integer;
  v_unl boolean;
  v_next bigint;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.organization_id, p.invoice_mode, p.invoice_prefix, p.invoice_start, p.invoice_min_digits, p.invoice_unlimited
    into v_org, v_mode, v_prefix, v_start, v_min, v_unl
  from public.maha_properties p
  join public.maha_organizations o on o.id = p.organization_id and o.owner_user_id = uid
  where p.id = p_property and p.deleted_at is null;
  if not found then
    raise exception 'property-not-owned' using errcode = '42501';
  end if;
  select o.invoice_scope, o.chain_code into v_scope, v_chain from public.maha_organizations o where o.id = v_org;
  if v_scope = 'chain' and v_chain is not null then
    select o.invoice_prefix, o.invoice_start, o.invoice_min_digits, o.invoice_unlimited into v_prefix, v_start, v_min, v_unl
    from public.maha_organizations o where o.id = v_org;
    select greatest(
      coalesce((select max(c.next_value) from public.maha_counters c join public.maha_properties p on p.id = c.property_id
                where p.organization_id = v_org and c.counter = 'invoice_manual'), 1),
      coalesce((select oc.next_value from public.maha_org_counters oc where oc.organization_id = v_org and oc.counter = 'invoice_manual'), 1))
      into v_next;
  else
    v_scope := 'hotel';
    select coalesce((select c.next_value from public.maha_counters c where c.property_id = p_property and c.counter = 'invoice_manual'), 1) into v_next;
  end if;
  return jsonb_build_object('mode', v_mode, 'scope', v_scope, 'chain_code', v_chain,
    'prefix', v_prefix, 'start', v_start, 'min_digits', v_min, 'unlimited', v_unl,
    'next_number', case when v_start is null then null else greatest(v_next, v_start) end,
    'issued', greatest(v_next - 1, 0));
end;
$$;

revoke all on function public.maha_issue_invoice_number(uuid, text, bigint, bigint) from public, anon;
grant execute on function public.maha_issue_invoice_number(uuid, text, bigint, bigint) to authenticated;
revoke all on function public.maha_set_invoice_format(uuid, uuid, text, text, bigint, integer, boolean) from public, anon, authenticated;
grant execute on function public.maha_set_invoice_format(uuid, uuid, text, text, bigint, integer, boolean) to service_role;
revoke all on function public.maha_invoice_format_of(uuid) from public, anon;
grant execute on function public.maha_invoice_format_of(uuid) to authenticated;

commit;
