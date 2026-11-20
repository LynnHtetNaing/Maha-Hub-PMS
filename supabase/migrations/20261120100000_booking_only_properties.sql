-- Maha Booking Engine: first-class properties that do not require Maha PMS.
-- A booking-only property still uses the tenant/property identity and record-sync boundary, but
-- has no PMS membership or PMS login. The public Booking Engine reads the same safe catalog RPC.
begin;

alter table public.maha_properties
  add column if not exists pms_enabled boolean not null default true;

alter table public.maha_booking_requests
  add column if not exists standalone_ref text;

create unique index if not exists maha_booking_requests_standalone_ref_uq
  on public.maha_booking_requests(property_id, standalone_ref)
  where standalone_ref is not null;

-- Provision a property owned by the platform admin without creating an Auth user or PMS membership.
create or replace function public.maha_provision_booking_property(
  p_org_id uuid,
  p_org_name text,
  p_owner uuid,
  p_property_name text,
  p_property_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_prop uuid;
begin
  if p_owner is null or p_property_name is null
     or length(trim(p_property_name)) not between 2 and 160
     or p_property_code is null
     or upper(trim(p_property_code)) !~ '^[A-Z0-9_-]{2,24}$' then
    raise exception 'invalid-fields' using errcode = '22023';
  end if;

  if p_org_id is null then
    if p_org_name is null or length(trim(p_org_name)) not between 2 and 160 then
      raise exception 'invalid-organization' using errcode = '22023';
    end if;
    insert into public.maha_organizations(name, owner_user_id)
    values (trim(p_org_name), p_owner)
    returning id into v_org;
  else
    select id into v_org
    from public.maha_organizations
    where id = p_org_id and owner_user_id = p_owner;
    if not found then
      raise exception 'organization-not-owned' using errcode = '42501';
    end if;
  end if;

  insert into public.maha_properties(organization_id, name, property_code, pms_enabled)
  values (v_org, trim(p_property_name), upper(trim(p_property_code)), false)
  returning id into v_prop;

  return jsonb_build_object('organization_id', v_org, 'property_id', v_prop, 'pms_enabled', false);
end;
$$;

revoke all on function public.maha_provision_booking_property(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.maha_provision_booking_property(uuid, text, uuid, text, text)
  to service_role;

-- Booking-only inventory is held in maha_booking_requests permanently; it is never expected to
-- materialise into a PMS reservations collection. PMS-linked properties continue to hand a request
-- over to the PMS, which then takes over the inventory count.
create or replace function public.maha_be_availability(
  p_property uuid, p_room_type text, p_arr date, p_dep date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allot integer;
  v_min integer;
  v_pms_enabled boolean := true;
begin
  if p_dep <= p_arr then return 0; end if;

  select coalesce(pms_enabled, true) into v_pms_enabled
  from public.maha_properties where id = p_property;
  if not found then return 0; end if;

  select (r.data->>'allot')::integer into v_allot
  from public.maha_records r
  where r.property_id = p_property and r.collection = 'roomTypes'
    and r.rec_key = p_room_type and not r.deleted;
  if v_allot is null then return 0; end if;

  select coalesce(min(v_allot - occ.n - req.n), v_allot) into v_min
  from generate_series(p_arr, p_dep - 1, interval '1 day') as night(d)
  left join lateral (
    select count(*) as n
    from public.maha_records r,
         jsonb_array_elements(coalesce(r.data->'bookings', '[]'::jsonb)) as b
    where r.property_id = p_property and r.collection = 'reservations' and not r.deleted
      and b->>'type' = p_room_type
      and coalesce(b->>'status', '') not in ('cancelled', 'noshow')
      and (b->>'arr')::date <= night.d::date and (b->>'dep')::date > night.d::date
  ) as occ on true
  left join lateral (
    select count(*) as n
    from public.maha_booking_requests br
    where br.property_id = p_property and br.room_type = p_room_type
      and br.status in ('pending', 'confirmed')
      and (not v_pms_enabled or br.confirmed_reservation_no is null)
      and br.arr <= night.d::date and br.dep > night.d::date
  ) as req on true;

  return greatest(0, v_min);
end;
$$;
revoke all on function public.maha_be_availability(uuid, text, date, date) from public;
grant execute on function public.maha_be_availability(uuid, text, date, date) to anon, authenticated;

-- A non-payment booking is instantly confirmed as before. For Booking-only properties it receives
-- its own stable reference; it remains in the booking-request inventory ledger indefinitely.
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
  v_pms_enabled boolean := true;
  v_ref text;
begin
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'guest name required'; end if;
  if p_email is null or length(trim(p_email)) < 3 then raise exception 'guest email required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;

  select coalesce(pms_enabled, true) into v_pms_enabled
  from public.maha_properties where id = p_property;
  if not found then raise exception 'property_not_found'; end if;

  v_free := public.maha_be_availability(p_property, p_room_type, p_arr, p_dep);
  if v_free < 1 then raise exception 'sold_out'; end if;

  if not v_pms_enabled then
    v_ref := 'MBE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;

  insert into public.maha_booking_requests
    (property_id, room_type, rate_code, arr, dep, adults, children, guest_name, guest_email, guest_phone, amount, currency, note, status, standalone_ref)
  values
    (p_property, p_room_type, p_rate_code, p_arr, p_dep, greatest(1, p_adults), greatest(0, p_children),
     trim(p_name), trim(p_email), nullif(trim(coalesce(p_phone, '')), ''),
     p_amount, upper(p_currency), nullif(trim(coalesce(p_note, '')), ''), 'confirmed', v_ref)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.maha_be_submit_request(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text) from public;
grant execute on function public.maha_be_submit_request(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text) to anon, authenticated;

-- A paid deposit completes the Booking-only reservation in the same ledger.
create or replace function public.maha_be_mark_paid(p_request uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_pms_enabled boolean := true;
  v_ref text;
begin
  select property_id into v_property
  from public.maha_booking_requests
  where id = p_request and status = 'pending' and payment_status = 'awaiting'
    and stripe_session_id = p_session_id
  for update;
  if v_property is null then raise exception 'not_awaiting'; end if;

  select coalesce(pms_enabled, true) into v_pms_enabled
  from public.maha_properties where id = v_property;
  if not v_pms_enabled then
    v_ref := 'MBE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;

  update public.maha_booking_requests
  set status = 'confirmed', payment_status = 'paid', stripe_session_id = p_session_id,
      standalone_ref = coalesce(standalone_ref, v_ref)
  where id = p_request;
end;
$$;
revoke all on function public.maha_be_mark_paid(uuid, text) from public;
grant execute on function public.maha_be_mark_paid(uuid, text) to anon, authenticated;

-- A receipt can show the Booking-only reservation reference without pretending it is a PMS number.
create or replace function public.maha_be_receipt(p_request uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'hotelName', p.name, 'guestName', r.guest_name, 'roomType', r.room_type, 'rateCode', r.rate_code,
    'arr', r.arr, 'dep', r.dep, 'adults', r.adults, 'children', r.children,
    'amount', r.amount, 'currency', r.currency,
    'depositAmount', r.deposit_amount, 'depositCurrency', r.deposit_currency,
    'paid', (r.payment_status = 'paid'),
    'reservationNo', coalesce(r.confirmed_reservation_no, r.standalone_ref),
    'createdAt', r.created_at
  )
  from public.maha_booking_requests r
  join public.maha_properties p on p.id = r.property_id
  where r.id = p_request and r.status = 'confirmed';
$$;
revoke all on function public.maha_be_receipt(uuid) from public;
grant execute on function public.maha_be_receipt(uuid) to anon, authenticated;

commit;
