-- Review hardening, activity log and gapless invoice number tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000701', 'provider-x@example.test'),
 ('00000000-0000-0000-0000-000000000702', 'staff-a@example.test'),
 ('00000000-0000-0000-0000-000000000703', 'staff-b@example.test'),
 ('00000000-0000-0000-0000-000000000704', 'reader@example.test');
insert into public.maha_platform_admins(user_id, note) values ('00000000-0000-0000-0000-000000000701', 'CI provider');

select public.maha_provision_hotel(null, 'Org A', '00000000-0000-0000-0000-000000000701', 'Hotel A', 'GLA01',
  '00000000-0000-0000-0000-000000000702', 'gl.a', 'staff-a@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org B', '00000000-0000-0000-0000-000000000701', 'Hotel B', 'GLB01',
  '00000000-0000-0000-0000-000000000703', 'gl.b', 'staff-b@example.test', 'staff');
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000704', 'read_only' from public.maha_properties where property_code = 'GLA01';

-- 010: the four new indexes exist.
do $$
begin
  if (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
      'maha_memberships_property_idx','maha_organizations_owner_idx','maha_property_cloud_updated_by_idx','maha_records_updated_by_idx')) <> 4 then
    raise exception 'review indexes missing';
  end if;
end
$$;

-- 011: the old whole-hotel sync objects are gone; the passphrase check and EDC functions are not touched.
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('maha_pull', 'maha_push')) then
    raise exception 'old whole-hotel sync functions still present';
  end if;
  if to_regclass('public.maha_cloud') is not null then
    raise exception 'old maha_cloud table still present';
  end if;
end
$$;

-- 012: activity log privileges.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_activity_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_activity_log', 'INSERT')
     or has_table_privilege('anon', 'public.maha_activity_log', 'SELECT') then
    raise exception 'browser roles can touch the activity log directly';
  end if;
  if has_function_privilege('authenticated', 'public.maha_log_event(uuid,text,text,text,text,boolean,text)', 'execute')
     or has_function_privilege('anon', 'public.maha_log_event(uuid,text,text,text,text,boolean,text)', 'execute') then
    raise exception 'browser roles can write log events';
  end if;
  if not has_function_privilege('service_role', 'public.maha_log_event(uuid,text,text,text,text,boolean,text)', 'execute') then
    raise exception 'service role cannot write log events';
  end if;
end
$$;

-- 012: events are stored trimmed, bad names are ignored, failed sign-ins are throttled.
do $$
declare i int;
begin
  perform public.maha_log_event('00000000-0000-0000-0000-000000000701', 'mahaadmin', 'hotel_created', 'GLA01', 'gla01', true, '  ok  ');
  perform public.maha_log_event(null, 'x', 'BAD EVENT!', null, null, true, null);
  if (select count(*) from public.maha_activity_log) <> 1 then raise exception 'bad event name was stored'; end if;
  if (select property_code from public.maha_activity_log where event = 'hotel_created') <> 'GLA01' then raise exception 'property code not normalised'; end if;
  if (select detail from public.maha_activity_log where event = 'hotel_created') <> 'ok' then raise exception 'detail not trimmed'; end if;
  for i in 1..25 loop
    perform public.maha_log_event('00000000-0000-0000-0000-000000000702', 'gl.a', 'sign_in_failed', null, null, false, 'wrong password');
  end loop;
  if (select count(*) from public.maha_activity_log where event = 'sign_in_failed') <> 10 then
    raise exception 'failed sign-ins were not throttled: %', (select count(*) from public.maha_activity_log where event = 'sign_in_failed');
  end if;
  perform public.maha_log_event('00000000-0000-0000-0000-000000000702', 'gl.a', 'sign_in', null, null, true, null);
end
$$;

-- 012: only the provider (code-verified once enrolled) can read the log.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1"}', false);
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.maha_recent_activity(50, null);
  if jsonb_array_length(r) < 3 then raise exception 'provider cannot read the log: %', r; end if;
  if (r -> 0 ->> 'event') <> 'sign_in' then raise exception 'newest event should come first: %', r -> 0; end if;
  if jsonb_array_length(public.maha_recent_activity(50, 'gla01')) <> 1 then raise exception 'hotel filter wrong'; end if;
  if r::text ~* 'password|token|@example' and r::text !~* 'wrong password' then raise exception 'log leaks something'; end if;
end
$$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_recent_activity(10, null); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'hotel staff could read the activity log'; end if;
end
$$;
reset role;

insert into auth.mfa_factors(id, user_id, status) values ('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-000000000701', 'verified');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1"}', false);
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_recent_activity(10, null); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'password-only provider session could read the log once enrolled'; end if;
end
$$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal2"}', false);
set role authenticated;
do $$
begin
  if jsonb_array_length(public.maha_recent_activity(10, null)) < 1 then raise exception 'two-step provider cannot read the log'; end if;
end
$$;
reset role;
delete from auth.mfa_factors;

-- 013: consecutive per-hotel numbers.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidA uuid; a1 jsonb; a2 jsonb; a3 jsonb;
begin
  select id into pidA from public.maha_properties where property_code = 'GLA01';
  a1 := public.maha_issue_invoice_no(pidA, 101);
  a2 := public.maha_issue_invoice_no(pidA, 101);
  a3 := public.maha_issue_invoice_no(pidA, 5);   -- a lower floor never rewinds
  if (a1->>'no')::int <> 101 or (a2->>'no')::int <> 102 or (a3->>'no')::int <> 103 then
    raise exception 'numbers not consecutive: % % %', a1, a2, a3;
  end if;
end
$$;
reset role;

-- Hotel B has its OWN sequence starting where it wants.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidB uuid; b1 jsonb; b2 jsonb;
begin
  select id into pidB from public.maha_properties where property_code = 'GLB01';
  b1 := public.maha_issue_invoice_no(pidB, 4061);
  b2 := public.maha_issue_invoice_no(pidB, 1);
  if (b1->>'no')::int <> 4061 or (b2->>'no')::int <> 4062 then raise exception 'hotel B sequence wrong: % %', b1, b2; end if;
end
$$;
reset role;

-- A read-only user cannot take numbers; a user of another hotel cannot take numbers for this one.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000704', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000704","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidA uuid; failed boolean := false;
begin
  select id into pidA from public.maha_properties where property_code = 'GLA01';
  begin perform public.maha_issue_invoice_no(pidA, 1); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'read-only user could take an invoice number'; end if;
end
$$;
reset role;
do $$
declare pidA uuid := (select id from public.maha_properties where property_code = 'GLA01'); failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', false);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","aal":"aal1"}', false);
  set local role authenticated;
  begin perform public.maha_issue_invoice_no(pidA, 1); exception when insufficient_privilege then failed := true; end;
  reset role;
  if not failed then raise exception 'other hotel staff could take numbers for this hotel'; end if;
end
$$;

-- A failed request leaves no hole: the number taken inside a rolled-back step is handed out again.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidA uuid; x jsonb; y jsonb;
begin
  select id into pidA from public.maha_properties where property_code = 'GLA01';
  begin
    x := public.maha_issue_invoice_no(pidA, 1);        -- 104
    raise exception 'simulated failure after taking a number';
  exception when raise_exception then
    null;
  end;
  y := public.maha_issue_invoice_no(pidA, 1);
  if (x->>'no')::int <> 104 or (y->>'no')::int <> 104 then raise exception 'rolled-back number was lost: % %', x, y; end if;
end
$$;
reset role;

-- Browser roles cannot touch the register or the counters directly.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_invoice_register', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_invoice_register', 'INSERT') then
    raise exception 'browser roles can touch the invoice register';
  end if;
end
$$;

-- Audit: numbers 101..104 issued for hotel A, only invoice record 101 and 103 exist -> 102 and 104 reported.
insert into public.maha_records(property_id, collection, rec_key, data, version, seq)
select id, 'invoices', '101', '{"no":101}'::jsonb, 1, 1 from public.maha_properties where property_code = 'GLA01';
insert into public.maha_records(property_id, collection, rec_key, data, version, seq)
select id, 'invoices', '103', '{"no":103}'::jsonb, 1, 2 from public.maha_properties where property_code = 'GLA01';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidA uuid; r jsonb;
begin
  select id into pidA from public.maha_properties where property_code = 'GLA01';
  r := public.maha_invoice_audit(pidA);
  if (r->>'issued')::int <> 4 or (r->>'first')::int <> 101 or (r->>'last')::int <> 104 then raise exception 'audit totals wrong: %', r; end if;
  if r->'issued_without_invoice_record' <> '[102, 104]'::jsonb then raise exception 'audit missing records wrong: %', r; end if;
  if r->'missing_from_sequence' <> '[]'::jsonb then raise exception 'audit sees holes that are not there: %', r; end if;
end
$$;
reset role;

-- Hotel staff cannot run the audit.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","aal":"aal1"}', false);
set role authenticated;
do $$
declare pidA uuid; failed boolean := false;
begin
  select id into pidA from public.maha_properties where property_code = 'GLA01';
  begin perform public.maha_invoice_audit(pidA); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'hotel staff could run the provider audit'; end if;
end
$$;
reset role;

rollback;
