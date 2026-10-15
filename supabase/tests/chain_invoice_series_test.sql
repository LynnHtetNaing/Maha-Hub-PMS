-- Chain tax-invoice series tests (one series per hotel, or one series for the whole chain). Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000c01', 'provider-c@example.test'),
 ('00000000-0000-0000-0000-000000000c02', 'staff-c1@example.test'),
 ('00000000-0000-0000-0000-000000000c03', 'staff-c2@example.test'),
 ('00000000-0000-0000-0000-000000000c04', 'reader-c@example.test'),
 ('00000000-0000-0000-0000-000000000c05', 'staff-x1@example.test'),
 ('00000000-0000-0000-0000-000000000c06', 'staff-x2@example.test'),
 ('00000000-0000-0000-0000-000000000c07', 'staff-s1@example.test'),
 ('00000000-0000-0000-0000-000000000c08', 'provider-d@example.test'),
 ('00000000-0000-0000-0000-000000000c09', 'plain-c@example.test');
insert into public.maha_platform_admins(user_id, note) values
 ('00000000-0000-0000-0000-000000000c01', 'CI provider'),
 ('00000000-0000-0000-0000-000000000c08', 'CI other provider');

select public.maha_provision_hotel(null, 'Org C1', '00000000-0000-0000-0000-000000000c01', 'Hotel C1', 'CHA01',
  '00000000-0000-0000-0000-000000000c02', 'ch.a', 'staff-c1@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org C2', '00000000-0000-0000-0000-000000000c01', 'Hotel C2', 'CHB01',
  '00000000-0000-0000-0000-000000000c03', 'ch.b', 'staff-c2@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org X1', '00000000-0000-0000-0000-000000000c01', 'Hotel X1', 'CHX01',
  '00000000-0000-0000-0000-000000000c05', 'ch.x', 'staff-x1@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org X2', '00000000-0000-0000-0000-000000000c01', 'Hotel X2', 'CHY01',
  '00000000-0000-0000-0000-000000000c06', 'ch.y', 'staff-x2@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org S1', '00000000-0000-0000-0000-000000000c01', 'Hotel S1', 'CHS01',
  '00000000-0000-0000-0000-000000000c07', 'ch.s', 'staff-s1@example.test', 'staff');
insert into public.maha_memberships(organization_id, property_id, user_id, role)
select organization_id, id, '00000000-0000-0000-0000-000000000c04', 'read_only' from public.maha_properties where property_code = 'CHA01';

-- two chains of this provider: CHAINONE (C1 + C2) and CHAINTWO (X1 + X2); S1 stays a single hotel
do $$
declare a jsonb; b jsonb;
begin
  a := public.maha_create_chain('00000000-0000-0000-0000-000000000c01', 'Chain One', 'CHAINONE1');
  b := public.maha_create_chain('00000000-0000-0000-0000-000000000c01', 'Chain Two', 'CHAINTWO2');
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000c01', (select id from public.maha_properties where property_code = 'CHA01'), (a->>'organization_id')::uuid);
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000c01', (select id from public.maha_properties where property_code = 'CHB01'), (a->>'organization_id')::uuid);
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000c01', (select id from public.maha_properties where property_code = 'CHX01'), (b->>'organization_id')::uuid);
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000c01', (select id from public.maha_properties where property_code = 'CHY01'), (b->>'organization_id')::uuid);
end
$$;

-- helpers (rolled back with everything else): sign in as a user, and take the month number of one hotel
create function public.t_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false),
         set_config('request.jwt.claims', '{"sub":"' || u::text || '","aal":"aal1"}', false)
$$;
create function public.t_seq(code text, ym text) returns int language sql security definer set search_path = '' as $$
  select (public.maha_issue_invoice_ref((select id from public.maha_properties where property_code = code), ym, 1, 1) ->> 'seq')::int
$$;
grant execute on function public.t_as(uuid), public.t_seq(text, text) to authenticated;

-- The new column and table: default is one series per hotel; browsers cannot touch the choice or the chain counters.
do $$
begin
  if exists (select 1 from public.maha_organizations where invoice_scope <> 'hotel') then
    raise exception 'a chain should start with one series per hotel';
  end if;
  if has_table_privilege('authenticated', 'public.maha_org_counters', 'select') or has_table_privilege('anon', 'public.maha_org_counters', 'select')
     or has_table_privilege('authenticated', 'public.maha_org_counters', 'insert') then
    raise exception 'browsers can reach the chain counters';
  end if;
  if has_function_privilege('authenticated', 'public.maha_set_invoice_scope(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.maha_set_invoice_scope(uuid,uuid,text)', 'execute') then
    raise exception 'browsers can change the invoice series';
  end if;
  if not has_function_privilege('service_role', 'public.maha_set_invoice_scope(uuid,uuid,text)', 'execute') then
    raise exception 'the trusted function cannot change the invoice series';
  end if;
  begin
    update public.maha_organizations set invoice_scope = 'other' where chain_code = 'CHAINONE1';
    raise exception 'a wrong choice was accepted';
  exception when check_violation then null;
  end;
end
$$;

-- 1. Default (one series per hotel): the two hotels of a chain each start at 1, October.
select public.t_as('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if public.t_seq('CHA01', '2026-10') <> 1 or public.t_seq('CHA01', '2026-10') <> 2 then raise exception 'C1 per-hotel run wrong'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ begin
  if public.t_seq('CHB01', '2026-10') <> 1 then raise exception 'C2 should have its own series at 1'; end if;
end $$;
reset role;

-- 2. Only the provider changes it (through the trusted function): wrong owner, other provider, single hotel, bad value are refused.
do $$
declare org1 uuid := (select organization_id from public.maha_properties where property_code = 'CHA01');
        orgs uuid := (select organization_id from public.maha_properties where property_code = 'CHS01');
        failed boolean; r jsonb;
begin
  failed := false; begin perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c09', org1, 'chain'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a non-provider changed the series'; end if;
  failed := false; begin perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c08', org1, 'chain'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'another provider changed this chain'; end if;
  failed := false; begin perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', orgs, 'chain'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a single hotel got a chain series'; end if;
  failed := false; begin perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', org1, 'both'); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a wrong value was accepted'; end if;
  if (select invoice_scope from public.maha_organizations where id = org1) <> 'hotel' then raise exception 'a refused change still changed it'; end if;
  r := public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', org1, 'chain');
  if r->>'invoice_scope' <> 'chain' or (r->>'changed')::boolean is not true then raise exception 'the provider could not switch: %', r; end if;
  r := public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', org1, 'chain');
  if (r->>'changed')::boolean is not false then raise exception 'repeat should say unchanged: %', r; end if;
end
$$;

-- 3. One series for the whole chain: C1 had used 1,2 and C2 used 1, so the chain goes on from 3 and the hotels take turns.
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ declare r jsonb; begin
  r := public.maha_issue_invoice_ref((select id from public.maha_properties where property_code = 'CHB01'), '2026-10', 1, 1);
  if (r->>'seq')::int <> 3 or r->>'scope' <> 'chain' then raise exception 'C2 should take chain number 3: %', r; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if public.t_seq('CHA01', '2026-10') <> 4 then raise exception 'C1 should take chain number 4'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ begin
  if public.t_seq('CHB01', '2026-10') <> 5 then raise exception 'C2 should take chain number 5'; end if;
  -- a new month restarts for the whole chain
  if public.t_seq('CHB01', '2026-11') <> 1 then raise exception 'November should restart at 1'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if public.t_seq('CHA01', '2026-11') <> 2 then raise exception 'November is shared: C1 should take 2'; end if;
  -- a lower floor from the page never rewinds the chain
  if public.t_seq('CHA01', '2026-10') <> 6 then raise exception 'October should go on at 6'; end if;
end $$;
reset role;

-- 4. Other chains and single hotels stay separate, whatever the first chain does.
select public.t_as('00000000-0000-0000-0000-000000000c05');
set role authenticated;
do $$ begin
  if public.t_seq('CHX01', '2026-10') <> 1 or public.t_seq('CHX01', '2026-10') <> 2 then raise exception 'chain two hotel X1 is not on its own series'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c06');
set role authenticated;
do $$ begin
  if public.t_seq('CHY01', '2026-10') <> 1 then raise exception 'chain two (one series per hotel) hotel X2 should start at 1'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c07');
set role authenticated;
do $$ begin
  if public.t_seq('CHS01', '2026-10') <> 1 then raise exception 'a single hotel should start at 1'; end if;
end $$;
reset role;

-- 5. Chain two switches on later: it goes on after the highest number its hotels already used (X1 used 1,2 -> next 3), then shares.
do $$ begin
  perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', (select organization_id from public.maha_properties where property_code = 'CHX01'), 'chain');
end $$;
select public.t_as('00000000-0000-0000-0000-000000000c06');
set role authenticated;
do $$ begin
  if public.t_seq('CHY01', '2026-10') <> 3 then raise exception 'X2 should go on at 3 (X1 already used 1 and 2)'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c05');
set role authenticated;
do $$ begin
  if public.t_seq('CHX01', '2026-10') <> 4 then raise exception 'X1 should take the shared 4'; end if;
end $$;
reset role;
-- chain one was not touched by chain two
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ begin
  if public.t_seq('CHB01', '2026-10') <> 7 then raise exception 'chain one went on at the wrong number'; end if;
end $$;
reset role;

-- 6. Switching back to one series per hotel never repeats a number a hotel has printed.
-- C1 printed 1,2 (own) then 4,6 (chain); C2 printed 1 (own) then 3,5,7 (chain). Their own counters are at 7 and 8.
do $$ begin
  perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', (select organization_id from public.maha_properties where property_code = 'CHA01'), 'hotel');
end $$;
select public.t_as('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if public.t_seq('CHA01', '2026-10') <> 7 then raise exception 'C1 repeated or rewound after switching back'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ begin
  if public.t_seq('CHB01', '2026-10') <> 8 then raise exception 'C2 repeated or rewound after switching back'; end if;
end $$;
reset role;
-- and switching to the chain again goes on after the highest of the two (C1 next 8, C2 next 9 -> 9)
do $$ begin
  perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000c01', (select organization_id from public.maha_properties where property_code = 'CHA01'), 'chain');
end $$;
select public.t_as('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if public.t_seq('CHA01', '2026-10') <> 9 then raise exception 'chain again should go on at 9'; end if;
end $$;
reset role;

-- 7. Read-only users and users of another hotel are refused, in both modes.
select public.t_as('00000000-0000-0000-0000-000000000c04');
set role authenticated;
do $$ declare failed boolean := false; begin
  begin perform public.t_seq('CHA01', '2026-10'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'read-only user took a chain number'; end if;
end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000c06');
set role authenticated;
do $$ declare failed boolean := false; begin
  begin perform public.t_seq('CHA01', '2026-10'); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a user of another hotel took a chain number'; end if;
end $$;
reset role;

-- A refused request leaves nothing behind: the number after the refusals is still 10 (C1 took 9 above).
select public.t_as('00000000-0000-0000-0000-000000000c03');
set role authenticated;
do $$ begin
  if public.t_seq('CHB01', '2026-10') <> 10 then raise exception 'a refused request used up a number'; end if;
end $$;
reset role;

-- The provider's picture tells each chain's choice.
select public.t_as('00000000-0000-0000-0000-000000000c01');
set role authenticated;
do $$
declare o jsonb;
begin
  o := public.maha_access_overview();
  if not exists (select 1 from jsonb_array_elements(o->'chains') c where c->>'chain_code' = 'CHAINONE1' and c->>'invoice_scope' = 'chain')
     or not exists (select 1 from jsonb_array_elements(o->'chains') c where c->>'chain_code' = 'CHAINTWO2' and c->>'invoice_scope' = 'chain') then
    raise exception 'the provider overview does not show the choice: %', o;
  end if;
end
$$;
reset role;
rollback;
