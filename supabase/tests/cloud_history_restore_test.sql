-- Cloud version history + restore tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000301', 'owner6@example.test'),
 ('00000000-0000-0000-0000-000000000302', 'staff6@example.test');

select public.maha_provision_hotel(null, 'Org H', '00000000-0000-0000-0000-000000000301',
  'Hotel H', 'HIST1', '00000000-0000-0000-0000-000000000302', 'hist.staff', 'staff6@example.test', 'staff');

-- Saves go through the real RPC, as the staff user.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', false);
set role authenticated;
do $$
declare pid uuid; r jsonb; i int;
begin
  select id into pid from public.maha_properties where property_code = 'HIST1';
  r := public.maha_save_property_cloud(pid, '{"n":1}'::jsonb, 0);
  if (r->>'version')::int <> 1 then raise exception 'first save failed: %', r; end if;
  for i in 1..24 loop
    r := public.maha_save_property_cloud(pid, jsonb_build_object('n', i + 1), i);
    if (r->>'version')::int <> i + 1 then raise exception 'save % failed: %', i, r; end if;
  end loop;
end
$$;
reset role;

do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'HIST1');
begin
  -- current version is 25; history keeps the latest 20 PREVIOUS versions (5..24)
  if (select version from public.maha_property_cloud where property_id = pid) <> 25 then
    raise exception 'expected current version 25';
  end if;
  if (select count(*) from public.maha_property_cloud_history where property_id = pid) <> 20 then
    raise exception 'history should be pruned to 20, got %', (select count(*) from public.maha_property_cloud_history where property_id = pid);
  end if;
  if (select min(version) from public.maha_property_cloud_history where property_id = pid) <> 5 then
    raise exception 'oldest kept version should be 5';
  end if;
  if (select payload->>'n' from public.maha_property_cloud_history where property_id = pid and version = 10) <> '10' then
    raise exception 'archived payload for version 10 is wrong';
  end if;
end
$$;

-- Browser roles cannot read history or run restore.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_property_cloud_history', 'SELECT')
     or has_table_privilege('anon', 'public.maha_property_cloud_history', 'SELECT') then
    raise exception 'browser roles can read cloud history';
  end if;
  if has_function_privilege('authenticated', 'public.maha_restore_property_cloud(uuid,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.maha_restore_property_cloud(uuid,bigint,uuid)', 'execute') then
    raise exception 'browser roles can run restore';
  end if;
end
$$;

-- Restore creates a NEW higher version with the old payload; stale clients then conflict.
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'HIST1'); r jsonb;
begin
  r := public.maha_restore_property_cloud(pid, 10, '00000000-0000-0000-0000-000000000301');
  if (r->>'version')::int <> 26 then raise exception 'restore should create version 26: %', r; end if;
  if (select payload->>'n' from public.maha_property_cloud where property_id = pid) <> '10' then
    raise exception 'restored payload wrong';
  end if;
  if (select count(*) from public.maha_property_cloud_history where property_id = pid and version = 25) <> 1 then
    raise exception 'pre-restore version was not archived';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'HIST1';
  r := public.maha_save_property_cloud(pid, '{"n":999}'::jsonb, 25);
  if not coalesce((r->>'conflict')::boolean, false) then raise exception 'stale client was not rejected after restore: %', r; end if;
end
$$;
reset role;

-- Unknown version fails.
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'HIST1'); failed boolean := false;
begin
  begin
    perform public.maha_restore_property_cloud(pid, 1, '00000000-0000-0000-0000-000000000301');
  exception when no_data_found then failed := true;
  end;
  if not failed then raise exception 'restoring a pruned version should fail'; end if;
end
$$;

rollback;