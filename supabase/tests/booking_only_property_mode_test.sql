-- Booking-only hotel provisioning tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000901', 'booking-provider@example.test'),
 ('00000000-0000-0000-0000-000000000902', 'booking-manager@example.test');

select public.maha_provision_hotel_v2(
  null, 'Booking Hotel Company', '00000000-0000-0000-0000-000000000901',
  'Booking Only Hotel', 'BKO01', '00000000-0000-0000-0000-000000000902',
  'booking.manager', 'booking-manager@example.test', 'property_admin', 'booking_only'
);

do $$
declare
  v_prop uuid;
begin
  select id into v_prop from public.maha_properties where property_code = 'BKO01';
  if v_prop is null then raise exception 'Booking-only property was not created'; end if;
  if (select product_mode from public.maha_properties where id = v_prop) <> 'booking_only' then
    raise exception 'Booking-only product mode was not persisted';
  end if;
  if not exists (
    select 1 from public.maha_memberships
    where property_id = v_prop and user_id = '00000000-0000-0000-0000-000000000902'
      and role = 'property_admin' and active
  ) then raise exception 'Booking-only owner login membership was not provisioned'; end if;
  if has_function_privilege('authenticated',
    'public.maha_provision_hotel_v2(uuid,text,uuid,text,text,uuid,text,text,text,text)', 'execute')
    or has_function_privilege('anon',
    'public.maha_provision_hotel_v2(uuid,text,uuid,text,text,uuid,text,text,text,text)', 'execute') then
    raise exception 'browser roles can execute Booking-only provisioning';
  end if;
  if not has_function_privilege('service_role',
    'public.maha_provision_hotel_v2(uuid,text,uuid,text,text,uuid,text,text,text,text)', 'execute') then
    raise exception 'service_role cannot execute Booking-only provisioning';
  end if;
end
$$;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.maha_provision_hotel_v2(
      null, 'Invalid Company', '00000000-0000-0000-0000-000000000901',
      'Invalid Hotel', 'BKO02', '00000000-0000-0000-0000-000000000902',
      'booking.manager2', 'booking-manager@example.test', 'property_admin', 'booking_and_pms'
    );
  exception when sqlstate '22023' then
    rejected := true;
  end;
  if not rejected then raise exception 'Invalid product mode was accepted'; end if;
  if exists (select 1 from public.maha_properties where property_code = 'BKO02') then
    raise exception 'Invalid provisioning left a property behind';
  end if;
end
$$;

-- A tenant owner cannot change the provider-owned product mode through the table API.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
do $$
declare rejected boolean := false;
begin
  begin
    update public.maha_properties set product_mode = 'pms' where property_code = 'BKO01';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'tenant was able to change the provider-owned product mode'; end if;
end
$$;
reset role;

rollback;
