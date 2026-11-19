-- Maha Booking Engine, Phase 1 + 2: live availability (never oversell) and a real, staff-confirmed
-- request record (never an unattended write into a hotel's live reservations - see Phase 3 later).
--
-- The Booking Engine (book/server.mjs) has no signed-in staff identity and no direct read of
-- maha_records (RLS requires maha_can_access_property, which needs auth.uid()). These two
-- SECURITY DEFINER functions are the only door it gets: one read-only availability check, one
-- insert of a pending request row - nothing else, and both re-derive everything from the hotel's
-- own live reservations/room types instead of trusting any number the browser sends.

begin;

create table if not exists public.maha_booking_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  room_type text not null,
  rate_code text not null,
  arr date not null,
  dep date not null,
  adults int not null default 1 check (adults > 0),
  children int not null default 0 check (children >= 0),
  guest_name text not null check (length(guest_name) between 1 and 120),
  guest_email text not null check (length(guest_email) between 3 and 160),
  guest_phone text,
  amount numeric not null check (amount > 0),
  currency text not null,
  note text,
  confirmed_reservation_no text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  check (dep > arr)
);
create index if not exists maha_booking_requests_prop_idx on public.maha_booking_requests(property_id, status, created_at desc);

alter table public.maha_booking_requests enable row level security;
revoke all on public.maha_booking_requests from public, anon, authenticated;

-- staff of the property see and decide on its own requests only
drop policy if exists maha_br_select_member on public.maha_booking_requests;
create policy maha_br_select_member
on public.maha_booking_requests for select to authenticated
using (public.maha_can_access_property(property_id));

drop policy if exists maha_br_update_member on public.maha_booking_requests;
create policy maha_br_update_member
on public.maha_booking_requests for update to authenticated
using (public.maha_can_access_property(property_id) and status = 'pending')
with check (public.maha_can_access_property(property_id));

-- How many rooms of this type are free for every night of [p_arr, p_dep) - reads the hotel's own
-- live reservations (maha_records), never a stale export. Returns 0 if the room type or its
-- allotment cannot be found, so "unknown" never reads as "available".
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

  select coalesce(min(v_allot - occ.n), v_allot) into v_min
  from generate_series(p_arr, p_dep - 1, interval '1 day') as night(d)
  left join lateral (
    select count(*) as n
    from public.maha_records r, jsonb_array_elements(coalesce(r.data->'bookings', '[]'::jsonb)) as b
    where r.property_id = p_property and r.collection = 'reservations' and not r.deleted
      and b->>'type' = p_room_type
      and coalesce(b->>'status', '') not in ('cancelled', 'noshow')
      and (b->>'arr')::date <= night.d::date and (b->>'dep')::date > night.d::date
  ) as occ on true;

  return greatest(0, v_min);
end;
$$;
revoke all on function public.maha_be_availability(uuid, text, date, date) from public;
grant execute on function public.maha_be_availability(uuid, text, date, date) to anon, authenticated;

-- A guest's request, never an unattended reservation. Re-checks availability itself - never trusts
-- a number the browser already showed, since minutes may have passed since that search.
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
    (property_id, room_type, rate_code, arr, dep, adults, children, guest_name, guest_email, guest_phone, amount, currency, note)
  values
    (p_property, p_room_type, p_rate_code, p_arr, p_dep, greatest(1, p_adults), greatest(0, p_children),
     trim(p_name), trim(p_email), nullif(trim(coalesce(p_phone, '')), ''), p_amount, upper(p_currency), nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.maha_be_submit_request(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text) from public;
grant execute on function public.maha_be_submit_request(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text) to anon, authenticated;

-- Staff decides: Confirm hands back to the PMS client, which creates the real reservation itself
-- (it already knows every PMS-internal field a reservation needs) and then marks this request
-- confirmed with that reservation's number; Decline just closes the request. Both are blocked once
-- a request is no longer pending, so a request can only ever be decided once.
create or replace function public.maha_be_decide_request(p_request uuid, p_confirm boolean, p_reservation_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop uuid;
begin
  select property_id into v_prop from public.maha_booking_requests where id = p_request and status = 'pending';
  if v_prop is null then raise exception 'not_pending'; end if;
  if not public.maha_can_access_property(v_prop) then raise exception 'access_denied'; end if;
  if p_confirm and (p_reservation_no is null or length(trim(p_reservation_no)) = 0) then raise exception 'reservation_no required'; end if;

  update public.maha_booking_requests
  set status = case when p_confirm then 'confirmed' else 'declined' end,
      confirmed_reservation_no = case when p_confirm then trim(p_reservation_no) else null end,
      decided_at = now(), decided_by = auth.uid()
  where id = p_request;
end;
$$;
revoke all on function public.maha_be_decide_request(uuid, boolean, text) from public;
grant execute on function public.maha_be_decide_request(uuid, boolean, text) to authenticated;

commit;
