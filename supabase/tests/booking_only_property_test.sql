-- Run after tenant identity, global property code, and booking-only provisioning migrations.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000b001','booking-only-owner@example.test');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b001',true);
set local role service_role;
select public.maha_provision_booking_only(
 null, 'Booking Only Organization', '00000000-0000-0000-0000-00000000b001',
 'Standalone Booking Property', 'BEO01'
);
reset role;
do $$
declare v_mode text; v_count integer;
begin
 select product_mode into v_mode from public.maha_properties where property_code='BEO01';
 if v_mode <> 'booking_only' then raise exception 'booking-only mode was not stored'; end if;
 select count(*) into v_count from public.maha_memberships m join public.maha_properties p on p.id=m.property_id where p.property_code='BEO01';
 if v_count <> 0 then raise exception 'booking-only property must not provision a PMS staff membership'; end if;
 select count(*) into v_count from public.maha_login_identities where username='booking.only';
 if v_count <> 0 then raise exception 'booking-only property must not create a staff login'; end if;
end $$;
do $$
begin
 if has_function_privilege('authenticated','public.maha_provision_booking_only(uuid,text,uuid,text,text)','execute')
    or has_function_privilege('anon','public.maha_provision_booking_only(uuid,text,uuid,text,text)','execute') then
   raise exception 'browser roles can provision booking-only properties';
 end if;
end $$;
rollback;
