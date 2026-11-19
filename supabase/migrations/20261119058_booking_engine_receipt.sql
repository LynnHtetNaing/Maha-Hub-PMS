-- Booking Engine: a read-only receipt view for a guest's own confirmed request - the request's own
-- unguessable id is its bearer token, same pattern as every other anonymous Booking Engine RPC.
-- Returns null for anything not status='confirmed' (never leaks a pending or declined request's
-- details, and never anything beyond this one request).

begin;

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
    'paid', (r.payment_status = 'paid'), 'reservationNo', r.confirmed_reservation_no, 'createdAt', r.created_at
  )
  from public.maha_booking_requests r
  join public.maha_properties p on p.id = r.property_id
  where r.id = p_request and r.status = 'confirmed';
$$;
revoke all on function public.maha_be_receipt(uuid) from public;
grant execute on function public.maha_be_receipt(uuid) to anon, authenticated;

commit;
