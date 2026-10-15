-- Provider "Change email" and sign-in overview tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000001001', 'prov@example.test'),
 ('00000000-0000-0000-0000-000000001002', 'prov2@example.test'),
 ('00000000-0000-0000-0000-000000001003', 'manager@example.test'),
 ('00000000-0000-0000-0000-000000001004', 'desk@example.test'),
 ('00000000-0000-0000-0000-000000001005', 'other@example.test');

select public.maha_provision_hotel(null, 'Org CE', '00000000-0000-0000-0000-000000001001',
  'Hotel CE', 'CHE01', '00000000-0000-0000-0000-000000001003', 'ce.manager', 'manager@example.test', 'property_admin');
select public.maha_provision_hotel(null, 'Org CF', '00000000-0000-0000-0000-000000001002',
  'Hotel CF', 'CHE02', '00000000-0000-0000-0000-000000001005', 'cf.manager', 'other@example.test', 'property_admin');
select public.maha_provision_staff((select id from public.maha_properties where property_code = 'CHE01'),
  '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001004', 'ce.desk', 'desk@example.test', 'staff');

-- Only the server function (service_role) may run these.
do $$
declare f text;
begin
  foreach f in array array[
    'public.maha_change_staff_email(uuid,text,text)',
    'public.maha_staff_signin_overview(uuid,uuid)',
    'public.maha_mask_email(text)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'browser roles can execute %', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'service_role cannot execute %', f;
    end if;
  end loop;
end
$$;

-- Two trusted devices for the desk person and one for the manager; one open sign-in attempt for the desk person.
insert into public.maha_trusted_devices(user_id, device_hash) values
 ('00000000-0000-0000-0000-000000001004', repeat('a', 64)),
 ('00000000-0000-0000-0000-000000001004', repeat('b', 64)),
 ('00000000-0000-0000-0000-000000001003', repeat('c', 64));
insert into public.maha_login_challenges(user_id, device_hash, expires_at)
values ('00000000-0000-0000-0000-000000001004', repeat('a', 64), now() + interval '10 minutes');

-- The overview lists this hotel staff with a masked address and the last code check.
do $$
declare r jsonb := public.maha_staff_signin_overview('00000000-0000-0000-0000-000000001001',
        (select id from public.maha_properties where property_code = 'CHE01')); e jsonb;
begin
  if jsonb_array_length(r) <> 2 then raise exception 'overview should list 2 people, got %', r; end if;
  select x into e from jsonb_array_elements(r) x where x->>'username' = 'ce.desk';
  if e->>'masked_email' <> 'd***@example.test' then raise exception 'bad mask %', e; end if;
  if (e->>'devices')::int <> 2 or e->>'last_verified_at' is null then raise exception 'bad device info %', e; end if;
  if r::text like '%desk@example.test%' then raise exception 'overview leaks the full address'; end if;
end
$$;

-- The overview refuses a hotel of another provider.
do $$
declare failed boolean := false;
begin
  begin
    perform public.maha_staff_signin_overview('00000000-0000-0000-0000-000000001001',
      (select id from public.maha_properties where property_code = 'CHE02'));
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'overview of a hotel the provider does not own'; end if;
end
$$;

-- Change the email: new address kept (lower case), devices and open attempts forgotten, masked answer.
do $$
declare r jsonb;
begin
  r := public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'CE.Desk', '  New.Desk@Example.Test ');
  if r->>'masked_new' <> 'n***@example.test' or r->>'masked_old' <> 'd***@example.test' then raise exception 'bad masks %', r; end if;
  if r->>'old_email' <> 'desk@example.test' then raise exception 'old address not returned'; end if;
  if (select recovery_email from public.maha_login_identities where username = 'ce.desk') <> 'new.desk@example.test' then
    raise exception 'new address not stored';
  end if;
  if exists (select 1 from public.maha_trusted_devices where user_id = '00000000-0000-0000-0000-000000001004') then
    raise exception 'trusted devices were not forgotten';
  end if;
  if exists (select 1 from public.maha_login_challenges where user_id = '00000000-0000-0000-0000-000000001004') then
    raise exception 'open sign-in attempt was not closed';
  end if;
  if not exists (select 1 from public.maha_trusted_devices where user_id = '00000000-0000-0000-0000-000000001003') then
    raise exception 'another person lost their trusted device';
  end if;
end
$$;

-- Refusals leave everything as it was.
do $$
declare failed boolean;
begin
  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'ce.desk', 'Manager@example.test');
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'duplicate address accepted'; end if;

  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'ce.desk', 'other@example.test');
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'address of another hotel accepted'; end if;

  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'ce.desk', 'not-an-address');
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'invalid address accepted'; end if;

  -- a person of another provider
  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'cf.manager', 'x.y@example.test');
  exception when no_data_found then failed := true; end;
  if not failed then raise exception 'changed the email of staff of another provider'; end if;

  -- someone who owns nothing calls it for a colleague
  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001003', 'ce.desk', 'x.y@example.test');
  exception when no_data_found then failed := true; end;
  if not failed then raise exception 'a non-owner changed an email'; end if;

  -- a provider account cannot be changed this way
  insert into public.maha_platform_admins(user_id) values ('00000000-0000-0000-0000-000000001003');
  failed := false;
  begin perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'ce.manager', 'p.q@example.test');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'provider account changed through the staff path'; end if;

  if (select recovery_email from public.maha_login_identities where username = 'ce.manager') <> 'manager@example.test' then
    raise exception 'refused change still changed the address';
  end if;
  if (select recovery_email from public.maha_login_identities where username = 'ce.desk') <> 'new.desk@example.test' then
    raise exception 'refused change altered the desk address';
  end if;
  -- provider accounts are not listed as staff
  if jsonb_array_length(public.maha_staff_signin_overview('00000000-0000-0000-0000-000000001001',
       (select id from public.maha_properties where property_code = 'CHE01'))) <> 1 then
    raise exception 'provider account listed as staff';
  end if;
end
$$;

-- Putting the old address back (what the function does if the Auth update fails) works.
do $$
begin
  perform public.maha_change_staff_email('00000000-0000-0000-0000-000000001001', 'ce.desk', 'desk@example.test');
  if (select recovery_email from public.maha_login_identities where username = 'ce.desk') <> 'desk@example.test' then
    raise exception 'revert failed';
  end if;
end
$$;

-- Browsers have no direct access to the identity table.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_login_identities', 'SELECT') then
    raise exception 'browser can read the identity table';
  end if;
end
$$;

rollback;
