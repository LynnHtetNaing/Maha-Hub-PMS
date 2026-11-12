-- Admin trusted device tests (migration 041). Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000701', 'owner-adm@example.test'),
 ('00000000-0000-0000-0000-000000000703', 'staff-adm@example.test');

select public.maha_provision_hotel(null, 'Org ADM', '00000000-0000-0000-0000-000000000701',
  'Hotel ADM', 'ADM01', '00000000-0000-0000-0000-000000000703', 'adm.staff', 'staff-adm@example.test', 'staff');

-- the owner is also an active platform admin (like the real provider)
insert into public.maha_platform_admins(user_id, active) values ('00000000-0000-0000-0000-000000000701', true)
on conflict (user_id) do update set active = true;

-- browser roles cannot call the service helpers or read the tables
do $$
begin
  if has_function_privilege('authenticated', 'public.maha_admin_trust_device(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_admin_register_session(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_admin_reset_mfa(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_owner_read_ok()', 'execute') then
    raise exception 'browser roles can call the admin device helpers';
  end if;
  if has_table_privilege('authenticated', 'public.maha_admin_sessions', 'select')
     or has_table_privilege('authenticated', 'public.maha_admin_devices', 'select') then
    raise exception 'browser roles can read the admin device tables';
  end if;
end
$$;

-- 1) Admin with NO Authenticator yet and a password-only session: sees nothing (the old gap is closed).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1","session_id":"00000000-0000-0000-0000-0000000007a1"}', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.maha_properties) then raise exception 'admin without Authenticator sees hotels'; end if;
  if public.maha_is_platform_admin() then raise exception 'admin without Authenticator has admin power'; end if;
  if not public.maha_is_platform_admin_raw() then raise exception 'raw admin check failed'; end if;
  if public.maha_admin_mode() <> 'none' then raise exception 'mode should be none, got %', public.maha_admin_mode(); end if;
end
$$;
reset role;

-- 2) The admin enrols the Authenticator; password-only still sees nothing.
insert into auth.mfa_factors(id, user_id, status)
values ('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-000000000701', 'verified');
set role authenticated;
do $$ begin
  if exists (select 1 from public.maha_properties) then raise exception 'aal1 admin sees hotels'; end if;
end $$;
reset role;

-- 3) Device trusted for 14 days, not after.
do $$
declare h text := repeat('a', 64);
begin
  if public.maha_admin_device_ok('00000000-0000-0000-0000-000000000701', h, 14) then raise exception 'device trusted before it was'; end if;
  perform public.maha_admin_trust_device('00000000-0000-0000-0000-000000000701', h);
  if not public.maha_admin_device_ok('00000000-0000-0000-0000-000000000701', h, 14) then raise exception 'device not trusted after Authenticator'; end if;
  update public.maha_admin_devices set trusted_at = now() - interval '15 days' where device_hash = h;
  if public.maha_admin_device_ok('00000000-0000-0000-0000-000000000701', h, 14) then raise exception 'device still trusted after 14 days'; end if;
end
$$;

-- 4) A registered trusted session READS (hotels, admin power) but cannot WRITE a hotel.
select public.maha_admin_register_session('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007a1', 12);
set role authenticated;
do $$
declare pid uuid; failed boolean := false;
begin
  if public.maha_admin_mode() <> 'limited' then raise exception 'mode should be limited, got %', public.maha_admin_mode(); end if;
  select id into pid from public.maha_properties where property_code = 'ADM01';
  if pid is null then raise exception 'limited admin cannot see the hotel'; end if;
  if not public.maha_is_platform_admin() then raise exception 'limited admin lost the admin read power'; end if;
  if public.maha_is_org_admin((select id from public.maha_organizations limit 1)) then raise exception 'limited admin is org admin'; end if;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'limited admin could write hotel data'; end if;
end
$$;
reset role;

-- 5) Another session of the same admin is not covered; an expired one neither.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1","session_id":"00000000-0000-0000-0000-0000000007a2"}', false);
set role authenticated;
do $$ begin
  if exists (select 1 from public.maha_properties) then raise exception 'unregistered session sees hotels'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1","session_id":"00000000-0000-0000-0000-0000000007a1"}', false);
update public.maha_admin_sessions set expires_at = now() - interval '1 minute';
set role authenticated;
do $$ begin
  if exists (select 1 from public.maha_properties) then raise exception 'expired session sees hotels'; end if;
end $$;
reset role;

-- 6) aal2: full power, can write.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal2","session_id":"00000000-0000-0000-0000-0000000007a3"}', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'ADM01';
  if public.maha_admin_mode() <> 'full' then raise exception 'mode should be full'; end if;
  r := public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  if jsonb_array_length(r->'applied') <> 1 then raise exception 'aal2 admin cannot write: %', r; end if;
end
$$;
reset role;

-- 7) Reset the Authenticator: the factor and the trusted devices are gone.
select public.maha_admin_trust_device('00000000-0000-0000-0000-000000000701', repeat('b', 64));
select public.maha_admin_reset_mfa('00000000-0000-0000-0000-000000000701');
do $$ begin
  if exists (select 1 from auth.mfa_factors where user_id = '00000000-0000-0000-0000-000000000701') then raise exception 'factor not reset'; end if;
  if exists (select 1 from public.maha_admin_devices where user_id = '00000000-0000-0000-0000-000000000701') then raise exception 'devices not forgotten'; end if;
end $$;

-- 8) A hotel owner who is NOT an admin keeps the old rule (no factor, password only, works); staff unaffected.
update public.maha_platform_admins set active = false where user_id = '00000000-0000-0000-0000-000000000701';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1"}', false);
set role authenticated;
do $$ begin
  if public.maha_admin_mode() <> '' then raise exception 'non-admin got an admin mode'; end if;
  if not exists (select 1 from public.maha_properties where property_code = 'ADM01') then raise exception 'plain owner lost access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","aal":"aal1"}', false);
set role authenticated;
do $$ begin
  if not exists (select 1 from public.maha_properties where property_code = 'ADM01') then raise exception 'staff lost access'; end if;
end $$;
reset role;

rollback;
