-- Provider-only staff administration tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000501', 'provider@example.test'),
 ('00000000-0000-0000-0000-000000000502', 'second-provider@example.test'),
 ('00000000-0000-0000-0000-000000000503', 'first-staff@example.test'),
 ('00000000-0000-0000-0000-000000000504', 'added-staff@example.test'),
 ('00000000-0000-0000-0000-000000000505', 'other-provider-staff@example.test');

-- Provider 1 owns hotel A; provider 2 owns hotel B.
select public.maha_provision_hotel(null, 'Org A', '00000000-0000-0000-0000-000000000501',
  'Hotel A', 'ADM01', '00000000-0000-0000-0000-000000000503', 'a.manager', 'first-staff@example.test', 'property_admin');
select public.maha_provision_hotel(null, 'Org B', '00000000-0000-0000-0000-000000000502',
  'Hotel B', 'ADM02', '00000000-0000-0000-0000-000000000505', 'b.manager', 'other-provider-staff@example.test', 'property_admin');

-- Browser roles cannot run any of these.
do $$
declare f text;
begin
  foreach f in array array[
    'public.maha_owned_staff(uuid,text)',
    'public.maha_provision_staff(uuid,uuid,uuid,text,text,text)',
    'public.maha_set_staff_active(uuid,text,boolean)',
    'public.maha_rename_staff(uuid,text,text)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'browser roles can execute %', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'service_role cannot execute %', f;
    end if;
  end loop;
end
$$;

-- Provider 1 adds staff to Hotel A.
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'ADM01'); r jsonb;
begin
  r := public.maha_provision_staff(pid, '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000504', 'a.frontdesk', 'added-staff@example.test', 'staff');
  if (select count(*) from public.maha_memberships where property_id = pid) <> 2 then
    raise exception 'expected two members in hotel A';
  end if;
end
$$;

-- Provider 1 cannot add staff to provider 2's hotel, nor to a made-up property.
do $$
declare pidB uuid := (select id from public.maha_properties where property_code = 'ADM02'); failed boolean := false;
begin
  begin
    perform public.maha_provision_staff(pidB, '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000504', 'sneaky', 'x@example.test', 'staff');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'provider added staff to a hotel they do not own'; end if;
  failed := false;
  begin
    perform public.maha_provision_staff(gen_random_uuid(), '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000504', 'ghost', 'x@example.test', 'staff');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'unknown property accepted'; end if;
  -- invalid role and duplicate username are rejected
  failed := false;
  begin
    perform public.maha_provision_staff((select id from public.maha_properties where property_code = 'ADM01'),
      '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000504', 'role.test', 'x@example.test', 'owner');
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'invalid role accepted'; end if;
  failed := false;
  begin
    perform public.maha_provision_staff((select id from public.maha_properties where property_code = 'ADM01'),
      '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000504', 'A.FRONTDESK', 'x@example.test', 'staff');
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'duplicate username accepted'; end if;
end
$$;

-- Ownership boundary for look-ups.
do $$
declare failed boolean := false; r jsonb;
begin
  r := public.maha_owned_staff('00000000-0000-0000-0000-000000000501', 'A.FrontDesk');
  if (r->>'user_id') <> '00000000-0000-0000-0000-000000000504' then raise exception 'owned_staff wrong: %', r; end if;
  begin
    perform public.maha_owned_staff('00000000-0000-0000-0000-000000000501', 'b.manager');
  exception when no_data_found then failed := true; end;
  if not failed then raise exception 'provider 1 can see provider 2 staff'; end if;
  failed := false;
  begin
    perform public.maha_owned_staff('00000000-0000-0000-0000-000000000501', 'nobody');
  exception when no_data_found then failed := true; end;
  if not failed then raise exception 'unknown staff accepted'; end if;
end
$$;

-- Disabling cuts data access immediately (membership inactive -> RLS and RPC checks fail); enabling restores it.
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'ADM01'); u uuid; failed boolean := false;
begin
  u := public.maha_set_staff_active('00000000-0000-0000-0000-000000000501', 'a.frontdesk', false);
  if u <> '00000000-0000-0000-0000-000000000504' then raise exception 'wrong user returned'; end if;
end
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', false);
set role authenticated;
do $$
declare pid uuid; failed boolean := false;
begin
  if exists (select 1 from public.maha_properties where property_code = 'ADM01') then
    raise exception 'disabled staff can still see the property';
  end if;
end
$$;
reset role;
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'ADM01'); failed boolean := false;
begin
  perform public.maha_set_staff_active('00000000-0000-0000-0000-000000000501', 'a.frontdesk', true);
  -- provider 1 cannot disable provider 2's staff
  begin
    perform public.maha_set_staff_active('00000000-0000-0000-0000-000000000501', 'b.manager', false);
  exception when no_data_found then failed := true; end;
  if not failed then raise exception 'provider 1 disabled provider 2 staff'; end if;
  if not (select active from public.maha_memberships where user_id = '00000000-0000-0000-0000-000000000505') then
    raise exception 'other provider staff was changed';
  end if;
end
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', false);
set role authenticated;
do $$
begin
  if not exists (select 1 from public.maha_properties where property_code = 'ADM01') then
    raise exception 're-enabled staff cannot see the property';
  end if;
end
$$;
reset role;

-- Rename keeps the same account; the new name must be free and well formed.
do $$
declare failed boolean := false;
begin
  perform public.maha_rename_staff('00000000-0000-0000-0000-000000000501', 'a.frontdesk', 'a.reception');
  if not exists (select 1 from public.maha_login_identities where username = 'a.reception'
                 and user_id = '00000000-0000-0000-0000-000000000504') then
    raise exception 'rename did not apply';
  end if;
  begin
    perform public.maha_rename_staff('00000000-0000-0000-0000-000000000501', 'a.reception', 'B.MANAGER');
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'rename onto an existing username was accepted'; end if;
  failed := false;
  begin
    perform public.maha_rename_staff('00000000-0000-0000-0000-000000000501', 'a.reception', 'bad name!');
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'malformed username accepted'; end if;
end
$$;

rollback;
