-- Maha Hub: gapless tax-invoice numbers, per hotel, optional per hotel.
--
-- A hotel that switches this on gets its tax-invoice numbers from the server, one at a time, strictly
-- consecutive, with its OWN sequence (hotel A and hotel B never share or interrupt each other's numbers).
-- A number is only taken inside a transaction that also records it in maha_invoice_register, so a failed
-- request cannot leave a hole. The register lets the provider audit later: every number issued should have an
-- invoice record; maha_invoice_audit() lists the ones that do not.
-- Hotels that do not switch it on keep the existing behaviour (leased blocks, gaps possible).

begin;

create table if not exists public.maha_invoice_register (
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  no bigint not null check (no > 0),
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  primary key (property_id, no)
);
create index if not exists maha_invoice_register_issued_by_idx on public.maha_invoice_register(issued_by);
alter table public.maha_invoice_register enable row level security;
revoke all on public.maha_invoice_register from public, anon, authenticated;

-- Take the next number for this hotel. floor_value = the hotel's starting number (only used when the
-- sequence is first created or a higher floor is needed, never to go backwards).
create or replace function public.maha_issue_invoice_no(target_property uuid, floor_value bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'property-write-denied' using errcode = '42501';
  end if;

  insert into public.maha_counters(property_id, counter, next_value)
  values (target_property, 'invoice_gapless', greatest(coalesce(floor_value, 1), 1))
  on conflict (property_id, counter)
  do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);

  update public.maha_counters
  set next_value = next_value + 1
  where property_id = target_property and counter = 'invoice_gapless'
  returning next_value - 1 into n;

  insert into public.maha_invoice_register(property_id, no, issued_by)
  values (target_property, n, (select auth.uid()));

  return jsonb_build_object('no', n);
end;
$$;

-- Provider audit: numbers issued vs invoice records present, plus holes in the issued run.
create or replace function public.maha_invoice_audit(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lo bigint; hi bigint; cnt bigint; missing_rec jsonb; holes jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select min(no), max(no), count(*) into lo, hi, cnt
  from public.maha_invoice_register where property_id = target_property;

  select coalesce(jsonb_agg(r.no order by r.no), '[]'::jsonb) into missing_rec
  from public.maha_invoice_register r
  where r.property_id = target_property
    and not exists (
      select 1 from public.maha_records x
      where x.property_id = target_property and x.collection = 'invoices' and not x.deleted
        and (x.data ->> 'no') ~ '^[0-9]+$' and (x.data ->> 'no')::bigint = r.no
    );

  select coalesce(jsonb_agg(g.n order by g.n), '[]'::jsonb) into holes
  from generate_series(coalesce(lo, 1), coalesce(hi, 0)) as g(n)
  where not exists (select 1 from public.maha_invoice_register r where r.property_id = target_property and r.no = g.n);

  return jsonb_build_object(
    'issued', cnt, 'first', lo, 'last', hi,
    'issued_without_invoice_record', missing_rec,
    'missing_from_sequence', holes
  );
end;
$$;

revoke all on function public.maha_issue_invoice_no(uuid, bigint) from public, anon;
revoke all on function public.maha_invoice_audit(uuid) from public, anon;
grant execute on function public.maha_issue_invoice_no(uuid, bigint) to authenticated;
grant execute on function public.maha_invoice_audit(uuid) to authenticated;

commit;
