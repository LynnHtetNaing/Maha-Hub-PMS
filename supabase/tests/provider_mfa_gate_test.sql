-- Provider two-factor gate tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000601', 'provider-mfa@example.test'),
 ('00000000-0000-0000-0000-000000000602', 'staff-mfa@example.test');

select public.maha_provision_hotel(null, 'Org MFA', '00000000-0000-0000-0000-000000000601',
  'Hotel MFA', 'MFA01', '00000000-0000-0000-0000-000000000602', 'mfa.staff', 'staff-mfa@example.test', 'staff');

-- Browser roles cannot call the MFA helper that the function uses.
do $$
begin
  if has_function_privilege('authenticated', 'public.maha_has_verified_mfa(uuid)', 'execute')
     or has_function_privilege('anon', 'public.maha_has_verified_mfa(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_owner_session_ok()', 'execute') then
    raise exception 'browser roles can call the MFA helpers';
  end if;
  if not has_function_privilege('service_role', 'public.maha_has_verified_mfa(uuid)', 'execute') then
    raise exception 'service_role cannot call maha_has_verified_mfa';
  end if;
end
$$;

-- 1) Provider with NO factor yet: owner access works (needed so the provider can enrol).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  if not exists (select 1 from public.maha_properties where property_code = 'MFA01') then
    raise exception 'provider without a factor cannot see their hotel (cannot enrol)';
  end if;
end
$$;
reset role;

-- The provider enrols and verifies an authenticator.
insert into auth.mfa_factors(id, user_id, status)
values ('00000000-0000-0000-0000-0000000006f1', '00000000-0000-0000-0000-000000000601', 'verified');

-- 2) Password-only session (aal1): no hotels, cannot read or write the hotel's data.
set role authenticated;
do $$
declare pid uuid; failed boolean := false;
begin
  if exists (select 1 from public.maha_properties) then
    raise exception 'aal1 provider session can still see hotels';
  end if;
  if public.maha_is_org_admin((select id from public.maha_organizations limit 1)) then
    raise exception 'aal1 provider session is still org admin';
  end if;
end
$$;
reset role;
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'MFA01'); failed boolean := false;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","aal":"aal1"}', false);
  set local role authenticated;
  begin perform public.maha_sync_pull(pid, 0, 10); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'aal1 provider could pull hotel data'; end if;
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'aal1 provider could write hotel data'; end if;
  reset role;
end
$$;

-- 3) Session that passed the 6-digit step (aal2): full access again.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","aal":"aal2"}', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'MFA01';
  if pid is null then raise exception 'aal2 provider cannot see their hotel'; end if;
  r := public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  if jsonb_array_length(r->'applied') <> 1 then raise exception 'aal2 provider cannot write: %', r; end if;
  r := public.maha_sync_pull(pid, 0, 10);
  if jsonb_array_length(r->'records') <> 1 then raise exception 'aal2 provider cannot read: %', r; end if;
end
$$;
reset role;

-- 4) Hotel staff are not affected by the provider's gate (membership access, aal1 is fine).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","aal":"aal1"}', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'MFA01';
  if pid is null then raise exception 'hotel staff lost access because of the provider gate'; end if;
  r := public.maha_sync_pull(pid, 0, 10);
  if jsonb_array_length(r->'records') <> 1 then raise exception 'staff cannot read: %', r; end if;
end
$$;
reset role;

-- 5) An unverified (half-finished enrolment) factor does not switch the gate on.
update auth.mfa_factors set status = 'unverified' where id = '00000000-0000-0000-0000-0000000006f1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000601","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  if not exists (select 1 from public.maha_properties where property_code = 'MFA01') then
    raise exception 'unverified factor wrongly gated the provider';
  end if;
end
$$;
reset role;

rollback;
