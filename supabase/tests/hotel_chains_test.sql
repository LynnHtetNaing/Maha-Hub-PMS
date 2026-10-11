-- Hotel chain tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000b01', 'provider-ch@example.test'),
 ('00000000-0000-0000-0000-000000000b02', 'staff1-ch@example.test'),
 ('00000000-0000-0000-0000-000000000b03', 'staff2-ch@example.test'),
 ('00000000-0000-0000-0000-000000000b04', 'provider2-ch@example.test'),
 ('00000000-0000-0000-0000-000000000b05', 'staff3-ch@example.test'),
 ('00000000-0000-0000-0000-000000000b06', 'other-staff-ch@example.test');
insert into public.maha_platform_admins(user_id, note) values
 ('00000000-0000-0000-0000-000000000b01', 'CI provider'),
 ('00000000-0000-0000-0000-000000000b04', 'CI provider 2');
insert into public.maha_login_identities(user_id, username, recovery_email)
values ('00000000-0000-0000-0000-000000000b01', 'ch.admin', 'provider-ch@example.test');

-- Three stand-alone hotels of provider 1 (X1, X2, X3), and one hotel of provider 2 (Z1).
select public.maha_provision_hotel(null, 'Hotel X1 Co', '00000000-0000-0000-0000-000000000b01', 'Hotel X1', 'CHX01',
  '00000000-0000-0000-0000-000000000b02', 'ch.staff1', 'staff1-ch@example.test', 'staff');
select public.maha_provision_hotel(null, 'Hotel X2 Co', '00000000-0000-0000-0000-000000000b01', 'Hotel X2', 'CHX02',
  '00000000-0000-0000-0000-000000000b03', 'ch.staff2', 'staff2-ch@example.test', 'staff');
select public.maha_provision_hotel(null, 'Hotel X3 Co', '00000000-0000-0000-0000-000000000b01', 'Hotel X3', 'CHX03',
  '00000000-0000-0000-0000-000000000b05', 'ch.staff3', 'staff3-ch@example.test', 'staff');
select public.maha_provision_hotel(null, 'Hotel Z1 Co', '00000000-0000-0000-0000-000000000b04', 'Hotel Z1', 'CHZ01',
  '00000000-0000-0000-0000-000000000b06', 'ch.other', 'other-staff-ch@example.test', 'staff');

-- Privileges: only the trusted service changes chains and access; the provider reads the overview.
do $$
begin
  if has_function_privilege('authenticated', 'public.maha_create_chain(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_rename_chain(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_move_hotel(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_set_hotel_access(uuid,text,uuid,boolean,text)', 'execute')
     or has_function_privilege('anon', 'public.maha_access_overview()', 'execute') then
    raise exception 'unexpected function privileges';
  end if;
  if not has_function_privilege('service_role', 'public.maha_move_hotel(uuid,uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.maha_access_overview()', 'execute') then
    raise exception 'expected function privileges are missing';
  end if;
end
$$;

-- Creating chains: the code is tidied up, must be 6 to 12 letters or numbers, and is unique everywhere.
do $$
declare r jsonb; failed boolean;
begin
  r := public.maha_create_chain('00000000-0000-0000-0000-000000000b01', 'Padauk Hotels', ' padk2026 ');
  if r->>'chain_code' <> 'PADK2026' then raise exception 'code not tidied: %', r; end if;
  failed := false; begin perform public.maha_create_chain('00000000-0000-0000-0000-000000000b01', 'Short', 'AB12'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a 4 character code was accepted'; end if;
  failed := false; begin perform public.maha_create_chain('00000000-0000-0000-0000-000000000b01', 'Long', 'ABCDEFGHIJKLM'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a 13 character code was accepted'; end if;
  failed := false; begin perform public.maha_create_chain('00000000-0000-0000-0000-000000000b01', 'Bad', 'AB-CD-12'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a code with dashes was accepted'; end if;
  failed := false; begin perform public.maha_create_chain('00000000-0000-0000-0000-000000000b04', 'Copycat', 'PADK2026'); exception when unique_violation then failed := true; end;
  if not failed then raise exception 'a duplicate code was accepted'; end if;
  failed := false; begin perform public.maha_create_chain('00000000-0000-0000-0000-000000000b06', 'Not a provider', 'NOTPROV123'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'someone who is not a provider created a chain'; end if;
  r := public.maha_create_chain('00000000-0000-0000-0000-000000000b01', 'Second Group', 'SECOND2026');
  r := public.maha_create_chain('00000000-0000-0000-0000-000000000b04', 'Other Group', 'OTHER2026');
  perform public.maha_rename_chain('00000000-0000-0000-0000-000000000b01', (select id from public.maha_organizations where chain_code = 'PADK2026'), 'Padauk Hotel Group');
  if (select name from public.maha_organizations where chain_code = 'PADK2026') <> 'Padauk Hotel Group' then raise exception 'rename failed'; end if;
  failed := false; begin perform public.maha_rename_chain('00000000-0000-0000-0000-000000000b04', (select id from public.maha_organizations where chain_code = 'PADK2026'), 'Hijack'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'another provider renamed the chain'; end if;
end
$$;

-- Moving hotels into the chain.
do $$
declare
  chain uuid := (select id from public.maha_organizations where chain_code = 'PADK2026');
  other_chain uuid := (select id from public.maha_organizations where chain_code = 'OTHER2026');
  x1 uuid := (select id from public.maha_properties where property_code = 'CHX01');
  x2 uuid := (select id from public.maha_properties where property_code = 'CHX02');
  z1 uuid := (select id from public.maha_properties where property_code = 'CHZ01');
  old_org uuid; failed boolean;
begin
  old_org := (select organization_id from public.maha_properties where id = x1);
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x1, chain);
  if (select organization_id from public.maha_properties where id = x1) <> chain then raise exception 'hotel not moved'; end if;
  if (select organization_id from public.maha_memberships where property_id = x1 and user_id = '00000000-0000-0000-0000-000000000b02') <> chain then raise exception 'staff membership stayed in the old company'; end if;
  if exists (select 1 from public.maha_organizations where id = old_org) then raise exception 'the empty old company was kept'; end if;
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x2, chain);

  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x1, chain); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'moved into the chain it is already in'; end if;
  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x1, other_chain); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'moved into another provider chain'; end if;
  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', (select id from public.maha_properties where property_code = 'CHX03'), (select organization_id from public.maha_properties where property_code = 'CHX03')); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'moved into a company that is not a chain'; end if;
  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', z1, chain); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'moved a hotel of another provider'; end if;
  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', (select id from public.maha_properties where property_code = 'CHX03'), null); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a stand-alone hotel was moved out of a chain it is not in'; end if;
end
$$;

-- Access: only ticked hotels, one chain per person, removal works at once.
do $$
declare
  x1 uuid := (select id from public.maha_properties where property_code = 'CHX01');
  x2 uuid := (select id from public.maha_properties where property_code = 'CHX02');
  x3 uuid := (select id from public.maha_properties where property_code = 'CHX03');
  z1 uuid := (select id from public.maha_properties where property_code = 'CHZ01');
  r jsonb; failed boolean;
begin
  r := public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', x2, true, 'staff');
  if r->'hotels' <> '["CHX01","CHX02"]'::jsonb then raise exception 'staff1 should open both chain hotels: %', r; end if;
  r := public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', x2, true, 'staff');
  if r->'hotels' <> '["CHX01","CHX02"]'::jsonb then raise exception 'granting twice changed something: %', r; end if;

  failed := false; begin perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff3', x1, true, 'staff'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a person from a stand-alone hotel was opened a chain hotel'; end if;
  failed := false; begin perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', x3, true, 'staff'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a person was given a hotel outside their chain'; end if;
  failed := false; begin perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', z1, true, 'staff'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a hotel of another provider was granted'; end if;
  failed := false; begin perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'nobody.here', x2, true, 'staff'); exception when no_data_found then failed := true; end;
  if not failed then raise exception 'an unknown person was granted a hotel'; end if;
  failed := false; begin perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b04', 'ch.staff1', x2, true, 'staff'); exception when no_data_found or insufficient_privilege then failed := true; end;
  if not failed then raise exception 'another provider changed access'; end if;
end
$$;

-- The real access check: staff1 can see exactly the hotels ticked for them, and loses one at once.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.maha_properties) <> 2 then raise exception 'staff1 should see the 2 ticked hotels, sees %', (select count(*) from public.maha_properties); end if;
end
$$;
reset role;
do $$
begin
  perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', (select id from public.maha_properties where property_code = 'CHX02'), false, 'staff');
end
$$;
set role authenticated;
do $$
begin
  if (select count(*) from public.maha_properties) <> 1 or (select property_code from public.maha_properties) <> 'CHX01' then raise exception 'removed access still works'; end if;
end
$$;
reset role;

-- A person split between two hotels blocks moving one of them out; once removed, the move works.
do $$
declare
  x1 uuid := (select id from public.maha_properties where property_code = 'CHX01');
  x2 uuid := (select id from public.maha_properties where property_code = 'CHX02');
  failed boolean; r jsonb; new_org uuid;
begin
  perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', x2, true, 'staff');
  failed := false; begin perform public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x2, null); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a hotel was moved out while a person works at it and another chain hotel'; end if;
  perform public.maha_set_hotel_access('00000000-0000-0000-0000-000000000b01', 'ch.staff1', x2, false, 'staff');
  r := public.maha_move_hotel('00000000-0000-0000-0000-000000000b01', x2, null);
  new_org := (r->>'organization_id')::uuid;
  if exists (select 1 from public.maha_organizations where id = new_org and chain_code is not null) then raise exception 'moved out hotel is still a chain'; end if;
  if (select name from public.maha_organizations where id = new_org) <> 'Hotel X2' then raise exception 'its own company should carry the hotel name'; end if;
  if (select organization_id from public.maha_memberships where user_id = '00000000-0000-0000-0000-000000000b03') <> new_org then raise exception 'its staff did not follow'; end if;
  if not exists (select 1 from public.maha_organizations where chain_code = 'PADK2026') then raise exception 'the chain disappeared'; end if;
end
$$;

-- The provider sees the chains, their hotels and who may open what; nobody else may ask.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b01","aal":"aal1"}', false);
set role authenticated;
do $$
declare o jsonb;
begin
  o := public.maha_access_overview();
  if jsonb_array_length(o->'chains') <> 2 then raise exception 'overview should list the 2 chains of this provider: %', o->'chains'; end if;
  if (select count(*) from jsonb_array_elements(o->'chains') c where c->>'chain_code' = 'OTHER2026') <> 0 then raise exception 'another provider chain is visible'; end if;
  if (select jsonb_array_length(c->'hotels') from jsonb_array_elements(o->'chains') c where c->>'chain_code' = 'PADK2026') <> 1 then raise exception 'the chain should hold one hotel now'; end if;
  if not (o->'access') @> '[{"username":"ch.staff1","property_code":"CHX01"}]'::jsonb then raise exception 'access list is missing staff1: %', o->'access'; end if;
  if (o->'access') @> '[{"username":"ch.other"}]'::jsonb then raise exception 'another provider people are visible'; end if;
end
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_access_overview(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'hotel staff could read the provider overview'; end if;
end
$$;
reset role;

-- Erasing the last hotel of a chain from the Recycle bin keeps the chain; a plain company of one still goes.
do $$
declare x1 uuid := (select id from public.maha_properties where property_code = 'CHX01'); x3 uuid := (select id from public.maha_properties where property_code = 'CHX03');
begin
  perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000b01', x1, 30);
  perform set_config('maha.recycle_op', 'on', true);
  update public.maha_properties set deleted_at = now() - interval '31 days', purge_at = now() - interval '1 day' where id = x1;
  perform set_config('maha.recycle_op', 'off', true);
  perform public.maha_purge_hotel('00000000-0000-0000-0000-000000000b01', x1);
  if not exists (select 1 from public.maha_organizations where chain_code = 'PADK2026') then raise exception 'the chain was erased with its last hotel'; end if;
  perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000b01', x3, 30);
  perform set_config('maha.recycle_op', 'on', true);
  update public.maha_properties set deleted_at = now() - interval '31 days', purge_at = now() - interval '1 day' where id = x3;
  perform set_config('maha.recycle_op', 'off', true);
  perform public.maha_purge_hotel('00000000-0000-0000-0000-000000000b01', x3);
  if exists (select 1 from public.maha_organizations where name = 'Hotel X3 Co') then raise exception 'a plain company of one was kept'; end if;
end
$$;

rollback;
