-- Provider-wide settings (code catalog + payment logos) tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000801', 'provider-ps@example.test'),
 ('00000000-0000-0000-0000-000000000802', 'staff-ps@example.test'),
 ('00000000-0000-0000-0000-000000000803', 'readonly-ps@example.test'),
 ('00000000-0000-0000-0000-000000000804', 'outsider-ps@example.test');
insert into public.maha_platform_admins(user_id, note) values ('00000000-0000-0000-0000-000000000801', 'CI provider');
insert into public.maha_login_identities(user_id, username, recovery_email)
values ('00000000-0000-0000-0000-000000000801', 'ps.admin', 'provider-ps@example.test');

select public.maha_provision_hotel(null, 'Org PS', '00000000-0000-0000-0000-000000000801', 'Hotel PS', 'PSH01',
  '00000000-0000-0000-0000-000000000802', 'ps.staff', 'staff-ps@example.test', 'staff');
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000803', 'read_only' from public.maha_properties where property_code = 'PSH01';
-- 804 belongs to no hotel at all.

-- Privileges: browsers have no table access; anonymous cannot call anything.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_platform_settings', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_platform_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.maha_platform_settings', 'UPDATE')
     or has_table_privilege('anon', 'public.maha_platform_settings', 'SELECT') then
    raise exception 'browser roles can touch the settings table directly';
  end if;
  if has_function_privilege('anon', 'public.maha_get_platform_settings()', 'execute')
     or has_function_privilege('anon', 'public.maha_save_platform_setting(text,jsonb,bigint)', 'execute')
     or has_function_privilege('anon', 'public.maha_platform_settings_versions()', 'execute')
     or has_function_privilege('authenticated', 'public.maha_platform_settings_can_read()', 'execute') then
    raise exception 'unexpected function privileges';
  end if;
end
$$;

-- Provider: first save (expected version 0), second save, stale save is a conflict and changes nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","aal":"aal1"}', false);
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.maha_save_platform_setting('catalog', '{"charges":[{"code":"SPA","desc":"Spa"}],"payments":[],"hidden":{}}'::jsonb, 0);
  if not (r->>'ok')::boolean or (r->>'version')::int <> 1 then raise exception 'first save failed: %', r; end if;
  r := public.maha_save_platform_setting('catalog', '{"charges":[{"code":"SPA","desc":"Spa"},{"code":"GYM","desc":"Gym"}],"payments":[],"hidden":{}}'::jsonb, 1);
  if (r->>'version')::int <> 2 then raise exception 'second save failed: %', r; end if;
  r := public.maha_save_platform_setting('catalog', '{"charges":[],"payments":[],"hidden":{"X":true}}'::jsonb, 1);
  if not coalesce((r->>'conflict')::boolean, false) or (r->>'version')::int <> 2 or jsonb_array_length(r->'data'->'charges') <> 2 then
    raise exception 'stale save should conflict with the current copy: %', r;
  end if;
  if jsonb_array_length((public.maha_get_platform_settings()->'catalog'->'data'->'charges')) <> 2 then raise exception 'stale save changed the data'; end if;
  -- creating a key that already exists with expected 0 is a conflict too
  r := public.maha_save_platform_setting('catalog', '{"charges":[]}'::jsonb, 0);
  if not coalesce((r->>'conflict')::boolean, false) then raise exception 'blind overwrite accepted: %', r; end if;
  r := public.maha_save_platform_setting('pay_logos', '{"VISA":"data:image/png;base64,AAAA"}'::jsonb, 0);
  if (r->>'version')::int <> 1 then raise exception 'logo save failed: %', r; end if;
end
$$;

-- Validation.
do $$
declare failed boolean;
begin
  failed := false; begin perform public.maha_save_platform_setting('secrets', '{"a":1}'::jsonb, 0); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'unknown key accepted'; end if;
  failed := false; begin perform public.maha_save_platform_setting('catalog', '[1,2]'::jsonb, 2); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'non-object accepted'; end if;
  failed := false; begin perform public.maha_save_platform_setting('catalog', jsonb_build_object('x', repeat('x', 310000)), 2); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'oversized catalog accepted'; end if;
end
$$;
reset role;

-- The activity log recorded the saves (who, which setting, which version).
do $$
begin
  if (select count(*) from public.maha_activity_log where event = 'platform_setting_saved' and actor_username = 'ps.admin') <> 3 then
    raise exception 'settings saves were not logged: %', (select count(*) from public.maha_activity_log where event = 'platform_setting_saved');
  end if;
end
$$;

-- Hotel staff (and read-only staff) can READ but never write.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false; r jsonb;
begin
  r := public.maha_get_platform_settings();
  if jsonb_array_length(r->'catalog'->'data'->'charges') <> 2 or (r->'catalog'->>'version')::int <> 2 or (r->'pay_logos'->>'version')::int <> 1 then
    raise exception 'staff cannot read the settings: %', r;
  end if;
  if (public.maha_platform_settings_versions()->>'catalog')::int <> 2 then raise exception 'staff cannot read versions'; end if;
  begin perform public.maha_save_platform_setting('catalog', '{"charges":[]}'::jsonb, 2); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'hotel staff could change the catalog'; end if;
end
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000803","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  if (public.maha_platform_settings_versions()->>'catalog')::int <> 2 then raise exception 'read-only staff cannot read'; end if;
  begin perform public.maha_save_platform_setting('pay_logos', '{"A":"b"}'::jsonb, 1); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'read-only staff could change logos'; end if;
end
$$;
reset role;

-- Someone with no hotel cannot read anything.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000804', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000804","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_get_platform_settings(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a user without a hotel could read the settings'; end if;
end
$$;
reset role;

-- Once the provider has enrolled a code step, a password-only session can neither read nor write.
insert into auth.mfa_factors(id, user_id, status) values ('00000000-0000-0000-0000-0000000008f1', '00000000-0000-0000-0000-000000000801', 'verified');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_get_platform_settings(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'password-only provider session could read'; end if;
  failed := false;
  begin perform public.maha_save_platform_setting('catalog', '{"charges":[]}'::jsonb, 2); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'password-only provider session could write'; end if;
end
$$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","aal":"aal2"}', false);
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.maha_save_platform_setting('catalog', '{"charges":[{"code":"NEW"}],"payments":[],"hidden":{}}'::jsonb, 2);
  if (r->>'version')::int <> 3 then raise exception 'two-step provider cannot save: %', r; end if;
end
$$;
reset role;

rollback;
