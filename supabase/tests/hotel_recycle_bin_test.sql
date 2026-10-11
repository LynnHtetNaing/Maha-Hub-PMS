-- Hotel Recycle bin tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000a01', 'provider-rb@example.test'),
 ('00000000-0000-0000-0000-000000000a02', 'staff-a-rb@example.test'),
 ('00000000-0000-0000-0000-000000000a03', 'staff-b-rb@example.test'),
 ('00000000-0000-0000-0000-000000000a04', 'provider2-rb@example.test'),
 ('00000000-0000-0000-0000-000000000a05', 'shared-rb@example.test');
insert into public.maha_platform_admins(user_id, note) values
 ('00000000-0000-0000-0000-000000000a01', 'CI provider'),
 ('00000000-0000-0000-0000-000000000a04', 'CI provider 2');
insert into public.maha_login_identities(user_id, username, recovery_email)
values ('00000000-0000-0000-0000-000000000a01', 'rb.admin', 'provider-rb@example.test');

-- Hotel A and hotel B in two organizations of the same provider; one more hotel C of another provider.
select public.maha_provision_hotel(null, 'Org A', '00000000-0000-0000-0000-000000000a01', 'Hotel A', 'RBA01',
  '00000000-0000-0000-0000-000000000a02', 'rb.staff.a', 'staff-a-rb@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org B', '00000000-0000-0000-0000-000000000a01', 'Hotel B', 'RBB01',
  '00000000-0000-0000-0000-000000000a03', 'rb.staff.b', 'staff-b-rb@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org C', '00000000-0000-0000-0000-000000000a04', 'Hotel C', 'RBC01',
  '00000000-0000-0000-0000-000000000a05', 'rb.shared', 'shared-rb@example.test', 'staff');

-- some hotel data
insert into public.maha_property_seq(property_id, last_seq)
select id, 1 from public.maha_properties where property_code = 'RBA01';
insert into public.maha_records(property_id, collection, rec_key, data, seq)
select id, 'guests', 'g1', '{"name":"Guest One"}'::jsonb, 1 from public.maha_properties where property_code = 'RBA01';

-- Privileges: only the trusted service can delete, restore or purge; only a signed-in user can open the list.
do $$
begin
  if has_function_privilege('authenticated', 'public.maha_recycle_hotel(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_restore_hotel(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_purge_hotel(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_recycle_expired(uuid)', 'execute')
     or has_function_privilege('anon', 'public.maha_recycle_list()', 'execute') then
    raise exception 'unexpected function privileges';
  end if;
  if not has_function_privilege('service_role', 'public.maha_recycle_hotel(uuid,uuid,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.maha_recycle_list()', 'execute') then
    raise exception 'expected function privileges are missing';
  end if;
end
$$;

-- Before: staff of A can use A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.maha_properties where property_code = 'RBA01') <> 1 then raise exception 'staff cannot see their own hotel before deletion'; end if;
  if (select count(*) from public.maha_records) <> 1 then raise exception 'staff cannot read hotel records before deletion'; end if;
end
$$;
reset role;

-- Another provider cannot delete this provider's hotel.
do $$
declare failed boolean := false;
begin
  begin perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a04', (select id from public.maha_properties where property_code = 'RBA01'), 30);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'another provider could delete the hotel'; end if;
end
$$;

-- Delete hotel A (30 days).
do $$
declare r jsonb; pid uuid := (select id from public.maha_properties where property_code = 'RBA01');
begin
  r := public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a01', pid, 30);
  if r->>'property_code' <> 'RBA01' then raise exception 'wrong hotel: %', r; end if;
  if jsonb_array_length(r->'staff_user_ids') <> 1 or (r->'staff_user_ids'->>0) <> '00000000-0000-0000-0000-000000000a02' then
    raise exception 'only the hotel staff should be locked out (never the provider): %', r;
  end if;
  if (select purge_at - deleted_at from public.maha_properties where id = pid) <> interval '30 days' then raise exception 'not kept for 30 days'; end if;
  if (select deleted_by from public.maha_properties where id = pid) <> '00000000-0000-0000-0000-000000000a01' then raise exception 'deleted_by missing'; end if;
end
$$;

-- Deleting it twice is refused.
do $$
declare failed boolean := false;
begin
  begin perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a01', (select id from public.maha_properties where property_code = 'RBA01'), 30);
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'second delete accepted'; end if;
end
$$;

-- While in the bin: staff see nothing and cannot sync or write; hotel B is not affected.
select set_config('rb.pid', (select id::text from public.maha_properties where property_code = 'RBA01'), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false; pid uuid := current_setting('rb.pid')::uuid;
begin
  if (select count(*) from public.maha_properties) <> 0 then raise exception 'staff still see the deleted hotel'; end if;
  if (select count(*) from public.maha_records) <> 0 then raise exception 'staff still read records of the deleted hotel'; end if;
  begin perform public.maha_sync_pull(pid, 0, 10); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'staff of a deleted hotel could still pull'; end if;
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"guests","key":"g2","base_version":0,"data":{"x":1}}]'::jsonb); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'staff of a deleted hotel could still write'; end if;
end
$$;
reset role;
-- The provider (a code step is not enrolled, so the owner gate is open) no longer reaches it either, and the bin lists it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","aal":"aal1"}', false);
set role authenticated;
do $$
declare l jsonb;
begin
  if (select count(*) from public.maha_properties where property_code = 'RBA01') <> 0 then raise exception 'provider still lists the deleted hotel'; end if;
  if (select count(*) from public.maha_properties where property_code = 'RBB01') <> 1 then raise exception 'provider lost the other hotel'; end if;
  l := public.maha_recycle_list();
  if jsonb_array_length(l) <> 1 or l->0->>'property_code' <> 'RBA01' or (l->0->>'records')::int <> 1 or l->0->>'deleted_by' <> 'rb.admin' then
    raise exception 'recycle list is wrong: %', l;
  end if;
end
$$;

-- Browsers cannot change the deleted markers, on a deleted or a live hotel.
do $$
declare failed boolean := false;
begin
  begin update public.maha_properties set deleted_at = now(), purge_at = now() + interval '1 day' where property_code = 'RBB01'; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a browser could delete a hotel directly'; end if;
end
$$;
reset role;

-- A browser cannot bring a deleted hotel back either (the row is invisible to it, so nothing changes).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  begin
    update public.maha_properties set deleted_at = null, purge_at = null, deleted_by = null where id = current_setting('rb.pid')::uuid;
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
do $$
begin
  if (select deleted_at from public.maha_properties where id = current_setting('rb.pid')::uuid) is null then
    raise exception 'a browser restored a deleted hotel';
  end if;
end
$$;
-- The hotel code and the staff username stay reserved while the hotel is in the bin.
do $$
declare failed boolean := false;
begin
  insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000a06', 'newcomer-rb@example.test');
  begin
    perform public.maha_provision_hotel(null, 'Org A2', '00000000-0000-0000-0000-000000000a01', 'Hotel A2', 'RBA01',
      '00000000-0000-0000-0000-000000000a06', 'rb.newcomer', 'newcomer-rb@example.test', 'staff');
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'a deleted hotel code was reused'; end if;
end
$$;

-- Restore: everything is back exactly as it was and the staff can work again.
do $$
declare r jsonb; pid uuid := (select id from public.maha_properties where property_code = 'RBA01');
begin
  r := public.maha_restore_hotel('00000000-0000-0000-0000-000000000a01', pid);
  if (select deleted_at from public.maha_properties where id = pid) is not null then raise exception 'still marked deleted'; end if;
  if jsonb_array_length(r->'staff_user_ids') <> 1 then raise exception 'staff to unlock: %', r; end if;
  if (select count(*) from public.maha_records where property_id = pid and rec_key = 'g1' and data->>'name' = 'Guest One') <> 1 then raise exception 'data changed by delete/restore'; end if;
end
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","aal":"aal1"}', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.maha_properties where property_code = 'RBA01') <> 1 then raise exception 'staff cannot see the hotel after restore'; end if;
end
$$;
reset role;

-- A staff member switched off before the delete stays off after the restore.
update public.maha_memberships set active = false where user_id = '00000000-0000-0000-0000-000000000a02';
do $$
declare r jsonb; pid uuid := (select id from public.maha_properties where property_code = 'RBA01');
begin
  perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a01', pid, 30);
  r := public.maha_restore_hotel('00000000-0000-0000-0000-000000000a01', pid);
  if jsonb_array_length(r->'staff_user_ids') <> 0 then raise exception 'an inactive staff member would be unlocked: %', r; end if;
end
$$;
update public.maha_memberships set active = true where user_id = '00000000-0000-0000-0000-000000000a02';

-- A hotel that is not in the bin cannot be purged; a live hotel is not purged by the expiry list.
do $$
declare failed boolean := false;
begin
  begin perform public.maha_purge_hotel('00000000-0000-0000-0000-000000000a01', (select id from public.maha_properties where property_code = 'RBB01'));
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a live hotel was purged'; end if;
  if jsonb_array_length(public.maha_recycle_expired('00000000-0000-0000-0000-000000000a01')) <> 0 then raise exception 'live hotel listed as expired'; end if;
end
$$;

-- After 30 days: not restorable, listed as expired, then purged with all of its data.
do $$
declare failed boolean := false; pid uuid := (select id from public.maha_properties where property_code = 'RBA01'); r jsonb;
begin
  perform public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a01', pid, 30);
  perform set_config('maha.recycle_op', 'on', true);
  update public.maha_properties set deleted_at = now() - interval '31 days', purge_at = now() - interval '1 day' where id = pid;
  perform set_config('maha.recycle_op', 'off', true);
  begin perform public.maha_restore_hotel('00000000-0000-0000-0000-000000000a01', pid); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'an expired hotel was restored'; end if;
  if public.maha_recycle_expired('00000000-0000-0000-0000-000000000a01') <> jsonb_build_array(pid) then raise exception 'expired list wrong'; end if;
  if jsonb_array_length(public.maha_recycle_expired('00000000-0000-0000-0000-000000000a04')) <> 0 then raise exception 'another provider sees the expiry'; end if;

  r := public.maha_purge_hotel('00000000-0000-0000-0000-000000000a01', pid);
  if r->>'property_code' <> 'RBA01' then raise exception 'purge answer: %', r; end if;
  if jsonb_array_length(r->'orphan_user_ids') <> 1 or (r->'orphan_user_ids'->>0) <> '00000000-0000-0000-0000-000000000a02' then raise exception 'logins to remove: %', r; end if;
  if exists (select 1 from public.maha_properties where id = pid)
     or exists (select 1 from public.maha_records where property_id = pid)
     or exists (select 1 from public.maha_property_seq where property_id = pid)
     or exists (select 1 from public.maha_memberships where property_id = pid) then
    raise exception 'hotel data still there after purge';
  end if;
  if exists (select 1 from public.maha_organizations where name = 'Org A') then raise exception 'the empty organization was not removed'; end if;
  if not exists (select 1 from public.maha_properties where property_code = 'RBB01') then raise exception 'purge touched another hotel'; end if;
end
$$;

-- A login that also works at another live hotel is not reported for deletion.
do $$
declare r jsonb; pid uuid := (select id from public.maha_properties where property_code = 'RBC01');
begin
  insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
  select p.organization_id, p.id, '00000000-0000-0000-0000-000000000a03', 'staff', true from public.maha_properties p where p.id = pid;
  r := public.maha_recycle_hotel('00000000-0000-0000-0000-000000000a04', pid, 30);
  if r->'staff_user_ids' @> '["00000000-0000-0000-0000-000000000a03"]'::jsonb then raise exception 'someone who works at another live hotel would be locked out'; end if;
  if not (r->'staff_user_ids' @> '["00000000-0000-0000-0000-000000000a05"]'::jsonb) then raise exception 'the hotel own staff were not listed: %', r; end if;
  perform set_config('maha.recycle_op', 'on', true);
  update public.maha_properties set purge_at = now() - interval '1 second', deleted_at = now() - interval '31 days' where id = pid;
  perform set_config('maha.recycle_op', 'off', true);
  r := public.maha_purge_hotel('00000000-0000-0000-0000-000000000a04', pid);
  if r->'orphan_user_ids' @> '["00000000-0000-0000-0000-000000000a03"]'::jsonb then raise exception 'a login that still has another hotel was reported for deletion'; end if;
end
$$;

rollback;
