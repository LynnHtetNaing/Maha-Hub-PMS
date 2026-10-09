-- Record-level sync tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000401', 'owner7@example.test'),
 ('00000000-0000-0000-0000-000000000402', 'front-a@example.test'),
 ('00000000-0000-0000-0000-000000000403', 'front-b@example.test'),
 ('00000000-0000-0000-0000-000000000404', 'viewer@example.test'),
 ('00000000-0000-0000-0000-000000000405', 'other-hotel@example.test');

select public.maha_provision_hotel(null, 'Org Sync', '00000000-0000-0000-0000-000000000401',
  'Hotel Sync', 'SYN01', '00000000-0000-0000-0000-000000000402', 'front.a', 'front-a@example.test', 'staff');
-- second staff + a read-only user in the same organisation/property, written as the trusted server would
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000403', 'staff' from public.maha_properties where property_code = 'SYN01';
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000404', 'read_only' from public.maha_properties where property_code = 'SYN01';
select public.maha_provision_hotel(null, 'Org Other', '00000000-0000-0000-0000-000000000401',
  'Hotel Other', 'OTH01', '00000000-0000-0000-0000-000000000405', 'other.user', 'other-hotel@example.test', 'staff');

-- Privileges: browsers cannot write tables directly.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.maha_records', 'UPDATE')
     or has_table_privilege('authenticated', 'public.maha_records', 'DELETE')
     or has_table_privilege('authenticated', 'public.maha_records', 'TRUNCATE')
     or has_table_privilege('anon', 'public.maha_records', 'SELECT') then
    raise exception 'unexpected privileges on maha_records';
  end if;
  if has_table_privilege('authenticated', 'public.maha_counters', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_property_seq', 'SELECT') then
    raise exception 'browser roles can read counters/seq directly';
  end if;
end
$$;

-- Device A pushes new records.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  r := public.maha_sync_push(pid, '[
    {"collection":"reservations","key":"r1","base_version":0,"data":{"id":"r1","guest":"Ann"}},
    {"collection":"reservations","key":"r2","base_version":0,"data":{"id":"r2","guest":"Bob"}},
    {"collection":"guests","key":"g1","base_version":0,"data":{"id":"g1","name":"Ann"}}
  ]'::jsonb);
  if jsonb_array_length(r->'applied') <> 3 or jsonb_array_length(r->'conflicts') <> 0 then
    raise exception 'initial push failed: %', r;
  end if;
  if (r->>'seq')::int <> 3 then raise exception 'seq should be 3: %', r; end if;
end
$$;
reset role;

-- Device B (different user) pulls everything, then edits a DIFFERENT record: no conflict.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  r := public.maha_sync_pull(pid, 0, 500);
  if jsonb_array_length(r->'records') <> 3 or (r->>'seq')::int <> 3 or (r->>'more')::boolean then
    raise exception 'full pull wrong: %', r;
  end if;
  if (r->'records'->0->>'key') <> 'r1' or (r->'records'->2->>'key') <> 'g1' then
    raise exception 'pull not in seq order: %', r;
  end if;
  r := public.maha_sync_push(pid, '[{"collection":"reservations","key":"r2","base_version":1,"data":{"id":"r2","guest":"Bob","room":"101"}}]'::jsonb);
  if jsonb_array_length(r->'applied') <> 1 or (r->'applied'->0->>'version')::int <> 2 then
    raise exception 'B edit of r2 failed: %', r;
  end if;
end
$$;
reset role;

-- Device A (stale: still believes r2 is version 1) edits r2 -> conflict with B's copy; edits r1 -> fine.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', false);
set role authenticated;
do $$
declare pid uuid; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  r := public.maha_sync_push(pid, '[
    {"collection":"reservations","key":"r2","base_version":1,"data":{"id":"r2","guest":"Bob (stale)"}},
    {"collection":"reservations","key":"r1","base_version":1,"data":{"id":"r1","guest":"Ann","room":"102"}}
  ]'::jsonb);
  if jsonb_array_length(r->'conflicts') <> 1 or (r->'conflicts'->0->>'key') <> 'r2'
     or (r->'conflicts'->0->'data'->>'room') <> '101' or (r->'conflicts'->0->>'version')::int <> 2 then
    raise exception 'stale edit should conflict with current copy: %', r;
  end if;
  if jsonb_array_length(r->'applied') <> 1 or (r->'applied'->0->>'key') <> 'r1' then
    raise exception 'non-conflicting change in the same batch should still apply: %', r;
  end if;
  -- the stale write must not have changed the record
  if (select data->>'guest' from public.maha_records where collection = 'reservations' and rec_key = 'r2') <> 'Bob' then
    raise exception 'stale write overwrote data';
  end if;
  -- creating a record that already exists (base 0) is also a conflict, never an overwrite
  r := public.maha_sync_push(pid, '[{"collection":"guests","key":"g1","base_version":0,"data":{"id":"g1","name":"Hijack"}}]'::jsonb);
  if jsonb_array_length(r->'conflicts') <> 1 then raise exception 'duplicate create must conflict: %', r; end if;
end
$$;

-- Delete = tombstone; incremental pull from a cursor sees only newer rows, including the delete.
do $$
declare pid uuid; r jsonb; cursor_seq bigint;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  cursor_seq := (public.maha_sync_pull(pid, 0, 500)->>'seq')::bigint;
  r := public.maha_sync_push(pid, '[{"collection":"guests","key":"g1","base_version":1,"deleted":true}]'::jsonb);
  if jsonb_array_length(r->'applied') <> 1 then raise exception 'delete failed: %', r; end if;
  r := public.maha_sync_pull(pid, cursor_seq, 500);
  if jsonb_array_length(r->'records') <> 1 or (r->'records'->0->>'deleted') <> 'true' or (r->'records'->0->'data') <> 'null'::jsonb then
    raise exception 'incremental pull should return only the tombstone: %', r;
  end if;
  -- paging
  r := public.maha_sync_pull(pid, 0, 2);
  if jsonb_array_length(r->'records') <> 2 or not (r->>'more')::boolean then
    raise exception 'paging wrong: %', r;
  end if;
end
$$;

-- Validation and safety.
do $$
declare pid uuid; failed boolean;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"cardVault":[1]}}]'::jsonb);
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'sensitive data accepted'; end if;
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"bad name!","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'bad collection accepted'; end if;
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0}]'::jsonb);
  exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'missing data accepted'; end if;
end
$$;

-- Number leases never overlap, survive concurrent devices, and respect the seed floor.
do $$
declare pid uuid; a jsonb; b jsonb; c jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  a := public.maha_lease_numbers(pid, 'nextRsv', 9480, 20);
  b := public.maha_lease_numbers(pid, 'nextRsv', 9480, 20);
  c := public.maha_lease_numbers(pid, 'nextRsv', 1, 5);
  if (a->>'start')::int <> 9480 or (a->>'end')::int <> 9499 then raise exception 'lease a wrong: %', a; end if;
  if (b->>'start')::int <> 9500 or (b->>'end')::int <> 9519 then raise exception 'lease b wrong: %', b; end if;
  if (c->>'start')::int <> 9520 then raise exception 'lower floor must not rewind the counter: %', c; end if;
end
$$;
reset role;

-- Read-only user can pull but not push or lease.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', false);
set role authenticated;
do $$
declare pid uuid; failed boolean := false; r jsonb;
begin
  select id into pid from public.maha_properties where property_code = 'SYN01';
  r := public.maha_sync_pull(pid, 0, 500);
  if jsonb_array_length(r->'records') < 3 then raise exception 'read-only user cannot read'; end if;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'read-only user could push'; end if;
  failed := false;
  begin perform public.maha_lease_numbers(pid, 'nextRsv', 1, 5);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'read-only user could lease numbers'; end if;
end
$$;
reset role;

-- A user of a DIFFERENT hotel cannot read or write this hotel; the table itself shows no rows.
do $$
declare pid uuid := (select id from public.maha_properties where property_code = 'SYN01'); failed boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000405', false);
  set local role authenticated;
  failed := false;
  begin perform public.maha_sync_pull(pid, 0, 500); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'other hotel user could pull'; end if;
  failed := false;
  begin perform public.maha_sync_push(pid, '[{"collection":"x","key":"k","base_version":0,"data":{"a":1}}]'::jsonb);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'other hotel user could push'; end if;
  if (select count(*) from public.maha_records) <> 0 then raise exception 'other hotel user can see records directly'; end if;
  reset role;
end
$$;

rollback;
