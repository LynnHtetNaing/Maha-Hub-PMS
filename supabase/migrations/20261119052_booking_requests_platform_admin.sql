-- Booking Engine fix: maha_booking_requests' select/update policies only checked
-- maha_can_access_property (hotel owner or an explicit membership row). Every other
-- provider-only table (e.g. maha_billing_docs) also ORs in maha_is_platform_admin() so the
-- provider console can reach any hotel's data - that OR was missing here, so Pending Bookings
-- showed "permission denied" for the provider console even against a real hotel.

begin;

drop policy if exists maha_br_select_member on public.maha_booking_requests;
create policy maha_br_select_member
on public.maha_booking_requests for select to authenticated
using (public.maha_can_access_property(property_id) or public.maha_is_platform_admin());

drop policy if exists maha_br_update_member on public.maha_booking_requests;
create policy maha_br_update_member
on public.maha_booking_requests for update to authenticated
using ((public.maha_can_access_property(property_id) or public.maha_is_platform_admin()) and status = 'pending')
with check (public.maha_can_access_property(property_id) or public.maha_is_platform_admin());

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
