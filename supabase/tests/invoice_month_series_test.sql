-- Tax-invoice month series tests (TIV-code-year-month-4 digits). Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000a01', 'provider-m@example.test'),
 ('00000000-0000-0000-0000-000000000a02', 'staff-m1@example.test'),
 ('00000000-0000-0000-0000-000000000a03', 'staff-m2@example.test'),
 ('00000000-0000-0000-0000-000000000a04', 'reader-m@example.test');
insert into public.maha_platform_admins(user_id, note) values ('00000000-0000-0000-0000-000000000a01', 'CI provider');

select public.maha_provision_hotel(null, 'Org M1', '00000000-0000-0000-0000-000000000a01', 'Hotel M1', 'MSA01',
  '00000000-0000-0000-0000-000000000a02', 'ms.a', 'staff-m1@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org M2', '00000000-0000-0000-0000-000000000a01', 'Hotel M2', 'MSB01',
  '00000000-0000-0000-0000-000000000a03', 'ms.b', 'staff-m2@example.test', 'staff');
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000a04', 'read_only' from public.maha_properties where property_code = 'MSA01';

-- Browsers can call it only when signed in.
do $$
begin
  if has_function_privilege('anon', 'public.maha_issue_invoice_ref(uuid,text,bigint,bigint)', 'execute') then
    raise exception 'anonymous can issue invoice numbers';
  end if;
  if not has_function_privilege('authenticated', 'public.maha_issue_invoice_ref(uuid,text,bigint,bigint)', 'execute') then
    raise exception 'signed-in users cannot issue invoice numbers';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","aal":"aal1"}', false);
set role authenticated;
do $$
declare p uuid; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb;
begin
  select id into p from public.maha_properties where property_code = 'MSA01';
  -- October: 0001, 0002; the overall number runs on 1, 2
  r1 := public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
  r2 := public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
  if (r1->>'no')::int <> 1 or (r1->>'seq')::int <> 1 or (r2->>'no')::int <> 2 or (r2->>'seq')::int <> 2 then
    raise exception 'October numbers wrong: % %', r1, r2;
  end if;
  -- November starts again at 0001 while the overall number goes on (3)
  r3 := public.maha_issue_invoice_ref(p, '2026-11', 1, 1);
  if (r3->>'no')::int <> 3 or (r3->>'seq')::int <> 1 or r3->>'ym' <> '2026-11' then
    raise exception 'November should restart at 1 and the overall number go on: %', r3;
  end if;
  -- back in October (a late invoice of an earlier month) continues October's run, no duplicate
  r4 := public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
  if (r4->>'seq')::int <> 3 or (r4->>'no')::int <> 4 then raise exception 'October did not continue: %', r4; end if;
  -- a lower floor never rewinds; a higher floor lifts the month (hotel already issued 0040 by hand)
  r5 := public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
  if (r5->>'seq')::int <> 4 then raise exception 'lower floor rewound: %', r5; end if;
  r5 := public.maha_issue_invoice_ref(p, '2026-10', 1, 40);
  if (r5->>'seq')::int <> 40 then raise exception 'higher floor not used: %', r5; end if;
  -- every overall number is in the audit register exactly once
  if (select count(*) from public.maha_invoice_register where property_id = p) <> 6 then
    raise exception 'register does not list every number';
  end if;
  -- bad month text is refused
  begin
    perform public.maha_issue_invoice_ref(p, '2026-13', 1, 1);
    raise exception 'bad month accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.maha_issue_invoice_ref(p, null, 1, 1);
    raise exception 'null month accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;
reset role;

-- Hotel B has its own series; the hotels never share or interrupt each other.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a03', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a03","aal":"aal1"}', false);
set role authenticated;
do $$
declare p uuid; r jsonb;
begin
  select id into p from public.maha_properties where property_code = 'MSB01';
  r := public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
  if (r->>'no')::int <> 1 or (r->>'seq')::int <> 1 then raise exception 'hotel B did not start at 1: %', r; end if;
end
$$;
reset role;

-- A read-only user cannot take numbers, and a user of another hotel cannot take this hotel's numbers.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a04', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a04","aal":"aal1"}', false);
set role authenticated;
do $$
declare p uuid;
begin
  select id into p from public.maha_properties where property_code = 'MSA01';
  begin
    perform public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
    raise exception 'read-only user took a number';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a03', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a03","aal":"aal1"}', false);
set role authenticated;
do $$
declare p uuid;
begin
  select id into p from public.maha_properties where property_code = 'MSA01';
  begin
    perform public.maha_issue_invoice_ref(p, '2026-10', 1, 1);
    raise exception 'another hotel took a number';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
