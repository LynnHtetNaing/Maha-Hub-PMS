-- Maha Hub: tax-invoice reference TIV-(hotel code)-year-month-4 digits, a new series for each month of each hotel.
--
-- maha_issue_invoice_ref gives, in ONE transaction, the hotel's next overall number (the same run as before, so the
-- audit register stays a single list) and the hotel's next number for that month (0001, 0002, ... restarting each month).
-- Both numbers are strictly consecutive. A failed request rolls both back, so neither can leave a hole.
-- The older maha_issue_invoice_no stays as it is, for pages that have not been updated yet.

begin;

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
  month_counter := 'invoice_m_' || p_ym;

  -- overall number (same counter and register as maha_issue_invoice_no)
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

  -- this month's number
  insert into public.maha_counters(property_id, counter, next_value)
  values (target_property, month_counter, greatest(coalesce(floor_seq, 1), 1))
  on conflict (property_id, counter)
  do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);
  update public.maha_counters
  set next_value = next_value + 1
  where property_id = target_property and counter = month_counter
  returning next_value - 1 into s;

  return jsonb_build_object('no', n, 'seq', s, 'ym', p_ym);
end;
$$;

revoke all on function public.maha_issue_invoice_ref(uuid, text, bigint, bigint) from public, anon;
grant execute on function public.maha_issue_invoice_ref(uuid, text, bigint, bigint) to authenticated;

commit;
