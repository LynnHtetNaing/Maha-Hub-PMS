-- Booking Engine Phase 3: a guest's request becomes a real reservation with no staff review -
-- explicitly chosen over the Phase 2 staff-confirm step. maha_be_submit_request now inserts the
-- row already 'confirmed' instead of 'pending'. The PMS client still does the actual reservation
-- write the same way it always has (confirmBookingRequest, newBooking) - nothing here writes a
-- reservation directly - but it now does that automatically the next time any staff session for
-- the hotel is open, with no Confirm click. Between the moment a guest books and the moment some
-- PMS session materialises it, availability must still never oversell: maha_be_availability now
-- also holds back rooms for every confirmed-but-not-yet-materialised request.

begin;

create or replace function public.maha_be_availability(p_property uuid, p_room_type text, p_arr date, p_dep date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allot integer;
  v_min integer;
begin
  if p_dep <= p_arr then return 0; end if;

  select (r.data->>'allot')::integer into v_allot
  from public.maha_records r
  where r.property_id = p_property and r.collection = 'roomTypes' and r.rec_key = p_room_type and not r.deleted;
  if v_allot is null then return 0; end if;

  select coalesce(min(v_allot - occ.n - req.n), v_allot) into v_min
  from generate_series(p_arr, p_dep - 1, interval '1 day') as night(d)
  left join lateral (
    select count(*) as n
    from public.maha_records r, jsonb_array_elements(coalesce(r.data->'bookings', '[]'::jsonb)) as b
    where r.property_id = p_property and r.collection = 'reservations' and not r.deleted
      and b->>'type' = p_room_type
      and coalesce(b->>'status', '') not in ('cancelled', 'noshow')
      and (b->>'arr')::date <= night.d::date and (b->>'dep')::date > night.d::date
  ) as occ on true
  left join lateral (
    select count(*) as n
    from public.maha_booking_requests br
    where br.property_id = p_property and br.room_type = p_room_type
      and br.status in ('pending', 'confirmed') and br.confirmed_reservation_no is null
      and br.arr <= night.d::date and br.dep > night.d::date
  ) as req on true;

  return greatest(0, v_min);
end;
$$;

create or replace function public.maha_be_submit_request(
  p_property uuid, p_room_type text, p_rate_code text, p_arr date, p_dep date,
  p_adults int, p_children int, p_name text, p_email text, p_phone text,
  p_amount numeric, p_currency text, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free integer;
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'guest name required'; end if;
  if p_email is null or length(trim(p_email)) < 3 then raise exception 'guest email required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;

  v_free := public.maha_be_availability(p_property, p_room_type, p_arr, p_dep);
  if v_free < 1 then raise exception 'sold_out'; end if;

  insert into public.maha_booking_requests
    (property_id, room_type, rate_code, arr, dep, adults, children, guest_name, guest_email, guest_phone, amount, currency, note, status)
  values
    (p_property, p_room_type, p_rate_code, p_arr, p_dep, greatest(1, p_adults), greatest(0, p_children),
     trim(p_name), trim(p_email), nullif(trim(coalesce(p_phone, '')), ''), p_amount, upper(p_currency), nullif(trim(coalesce(p_note, '')), ''), 'confirmed')
  returning id into v_id;

  return v_id;
end;
$$;

-- maha_be_decide_request used to only act on status='pending' (the Phase 2 staff-confirm step).
-- Requests now arrive already 'confirmed' - the real gate is "not yet materialised into a real
-- reservation" (confirmed_reservation_no is null), not the status column. p_confirm=true records
-- the reservation the PMS client just created; p_confirm=false is now a staff override to cancel
-- a request before it gets materialised (a guest calling moments after booking, say).
create or replace function public.maha_be_decide_request(p_request uuid, p_confirm boolean, p_reservation_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop uuid;
begin
  select property_id into v_prop from public.maha_booking_requests where id = p_request and confirmed_reservation_no is null and status <> 'declined';
  if v_prop is null then raise exception 'not_pending'; end if;
  if not (public.maha_can_access_property(v_prop) or public.maha_is_platform_admin()) then raise exception 'access_denied'; end if;
  if p_confirm and (p_reservation_no is null or length(trim(p_reservation_no)) = 0) then raise exception 'reservation_no required'; end if;

  update public.maha_booking_requests
  set status = case when p_confirm then 'confirmed' else 'declined' end,
      confirmed_reservation_no = case when p_confirm then trim(p_reservation_no) else null end,
      decided_at = now(), decided_by = auth.uid()
  where id = p_request;
end;
$$;

commit;
