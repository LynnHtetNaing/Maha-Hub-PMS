-- Tax Invoice Reference tests: Standard stays as before; Manual (prefix, starting number, minimum digits, unlimited or fixed width),
-- gapless server numbers, one series per hotel or one shared by a chain. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000d01', 'provider-m@example.test'),
 ('00000000-0000-0000-0000-000000000d02', 'staff-m1@example.test'),
 ('00000000-0000-0000-0000-000000000d03', 'staff-m2@example.test'),
 ('00000000-0000-0000-0000-000000000d04', 'staff-m3@example.test'),
 ('00000000-0000-0000-0000-000000000d05', 'provider-n@example.test'),
 ('00000000-0000-0000-0000-000000000d06', 'plain-m@example.test'),
 ('00000000-0000-0000-0000-000000000d07', 'staff-m4@example.test');
insert into public.maha_platform_admins(user_id, note) values
 ('00000000-0000-0000-0000-000000000d01', 'CI provider'),
 ('00000000-0000-0000-0000-000000000d05', 'CI other provider');

select public.maha_provision_hotel(null, 'Org M1', '00000000-0000-0000-0000-000000000d01', 'Hotel M1', 'MAN01',
  '00000000-0000-0000-0000-000000000d02', 'man.a', 'staff-m1@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org M2', '00000000-0000-0000-0000-000000000d01', 'Hotel M2', 'MAN02',
  '00000000-0000-0000-0000-000000000d03', 'man.b', 'staff-m2@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org M3', '00000000-0000-0000-0000-000000000d01', 'Hotel M3', 'MAN03',
  '00000000-0000-0000-0000-000000000d04', 'man.c', 'staff-m3@example.test', 'staff');
select public.maha_provision_hotel(null, 'Org M4', '00000000-0000-0000-0000-000000000d01', 'Hotel M4', 'MAN04',
  '00000000-0000-0000-0000-000000000d07', 'man.d', 'staff-m4@example.test', 'staff');

-- MAN02 and MAN03 are one chain
do $$
declare a jsonb;
begin
  a := public.maha_create_chain('00000000-0000-0000-0000-000000000d01', 'Manual Chain', 'MANCHAIN1');
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000d01', (select id from public.maha_properties where property_code = 'MAN02'), (a->>'organization_id')::uuid);
  perform public.maha_move_hotel('00000000-0000-0000-0000-000000000d01', (select id from public.maha_properties where property_code = 'MAN03'), (a->>'organization_id')::uuid);
end
$$;

create function public.t_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false),
         set_config('request.jwt.claims', '{"sub":"' || u::text || '","aal":"aal1"}', false)
$$;
-- one invoice number of one hotel, as the page asks for it (floor 1 = the page has no invoices yet)
create function public.t_issue(code text, ym text) returns jsonb language sql security definer set search_path = '' as $$
  select public.maha_issue_invoice_number((select id from public.maha_properties where property_code = code), ym, 1, 1)
$$;
create function public.t_pid(code text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.maha_properties where property_code = code
$$;
grant execute on function public.t_as(uuid), public.t_issue(text, text), public.t_pid(text) to authenticated;

-- 1. Rights and defaults: every hotel starts in Standard; browsers cannot change the format or see the chain columns.
do $$
begin
  if exists (select 1 from public.maha_properties where invoice_mode <> 'standard') then raise exception 'a hotel should start in Standard'; end if;
  if has_function_privilege('authenticated', 'public.maha_set_invoice_format(uuid,uuid,text,text,bigint,integer,boolean)', 'execute')
     or has_function_privilege('anon', 'public.maha_set_invoice_format(uuid,uuid,text,text,bigint,integer,boolean)', 'execute') then
    raise exception 'browsers can change the invoice format';
  end if;
  if not has_function_privilege('service_role', 'public.maha_set_invoice_format(uuid,uuid,text,text,bigint,integer,boolean)', 'execute') then
    raise exception 'the trusted function cannot change the invoice format';
  end if;
  if has_function_privilege('anon', 'public.maha_issue_invoice_number(uuid,text,bigint,bigint)', 'execute')
     or has_function_privilege('anon', 'public.maha_invoice_format_of(uuid)', 'execute') then
    raise exception 'anonymous users can reach the invoice functions';
  end if;
  begin
    update public.maha_properties set invoice_mode = 'other' where property_code = 'MAN01';
    raise exception 'a wrong mode was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.maha_properties set invoice_prefix = 'AB C' where property_code = 'MAN01';
    raise exception 'a prefix with a space was accepted';
  exception when check_violation then null;
  end;
end
$$;

-- 2. Standard is exactly as before: the new entry point gives what maha_issue_invoice_ref gives.
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.t_issue('MAN01', '2026-10');
  if (r->>'no')::int <> 1 or (r->>'seq')::int <> 1 or r->>'ym' <> '2026-10' or r ? 'ref' then raise exception 'Standard changed: %', r; end if;
  r := public.t_issue('MAN01', '2026-10');
  if (r->>'no')::int <> 2 or (r->>'seq')::int <> 2 then raise exception 'Standard second number wrong: %', r; end if;
  r := public.t_issue('MAN01', '2026-11');
  if (r->>'no')::int <> 3 or (r->>'seq')::int <> 1 then raise exception 'Standard restarts each month: %', r; end if;
end
$$;
reset role;

-- 3. Only the provider sets the format (trusted function). Wrong owner, other provider, bad values are refused.
do $$
declare p uuid := public.t_pid('MAN01');
        failed boolean; r jsonb;
begin
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d06', p, 'manual', 'INV-', 1, 6, true); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'a non-provider changed the format'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d05', p, 'manual', 'INV-', 1, 6, true); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'another provider changed this hotel'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'both', 'INV-', 1, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a wrong mode was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'INV 1', 1, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a prefix with a space was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'ABCDEFGHIJKLMNOPQRSTU', 1, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a 21-character prefix was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'INV-', 0, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'starting number 0 was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'INV-', 1, 0, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception '0 digits was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'INV-', 1, 13, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception '13 digits was accepted'; end if;
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'INV-', 1, 6, null); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a missing unlimited choice was accepted'; end if;
  if (select invoice_mode from public.maha_properties where id = p) <> 'standard' then raise exception 'a refused change still changed the mode'; end if;
  r := public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'TAX/2026/', 123, 6, true);
  if r->>'invoice_mode' <> 'manual' or (r->>'on_chain')::boolean is not false then raise exception 'the provider could not set Manual: %', r; end if;
end
$$;

-- 4. Manual, one series for the hotel: the number runs from the typed starting number, gapless, with the prefix and zero padding.
--    Standard invoices already issued are left as they are; the overall audit number goes on.
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.t_issue('MAN01', '2026-10');
  if r->>'ref' <> 'TAX/2026/000123' or (r->>'mseq')::int <> 123 or (r->>'no')::int <> 4 or r->>'mode' <> 'manual' then raise exception 'first Manual number wrong: %', r; end if;
  r := public.t_issue('MAN01', '2026-10');
  if r->>'ref' <> 'TAX/2026/000124' or (r->>'no')::int <> 5 then raise exception 'second Manual number wrong: %', r; end if;
  -- a new month does NOT restart a Manual number
  r := public.t_issue('MAN01', '2026-12');
  if r->>'ref' <> 'TAX/2026/000125' then raise exception 'Manual must not restart by month: %', r; end if;
  -- the page's own floor (what it has seen) can only move the counter up
  r := public.maha_issue_invoice_number(public.t_pid('MAN01'), '2026-12', 1, 200);
  if r->>'ref' <> 'TAX/2026/000200' then raise exception 'a higher floor should move the counter up: %', r; end if;
  r := public.maha_issue_invoice_number(public.t_pid('MAN01'), '2026-12', 1, 1);
  if r->>'ref' <> 'TAX/2026/000201' then raise exception 'the counter must never go back: %', r; end if;
end
$$;
reset role;

-- 5. The provider's page can read it; a starting number lower than the highest issued is refused; going back to Standard keeps the counters.
select public.t_as('00000000-0000-0000-0000-000000000d01');
set role authenticated;
do $$
declare f jsonb;
begin
  f := public.maha_invoice_format_of(public.t_pid('MAN01'));
  if f->>'mode' <> 'manual' or f->>'prefix' <> 'TAX/2026/' or (f->>'next_number')::int <> 202 or (f->>'issued')::int <> 201 or f->>'scope' <> 'hotel' then
    raise exception 'format_of wrong: %', f;
  end if;
end
$$;
reset role;
do $$
declare p uuid := public.t_pid('MAN01'); failed boolean; r jsonb;
begin
  failed := false; begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'TAX/2026/', 150, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a starting number below the highest issued was accepted'; end if;
  r := public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'standard', null, null, null, null);
  if r->>'invoice_mode' <> 'standard' then raise exception 'could not go back to Standard: %', r; end if;
  if (select invoice_prefix from public.maha_properties where id = p) <> 'TAX/2026/' then raise exception 'going back to Standard lost the saved format'; end if;
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.t_issue('MAN01', '2026-11');
  if r ? 'ref' or (r->>'seq')::int <> 2 then raise exception 'back in Standard the month series goes on: %', r; end if;
end
$$;
reset role;
-- and a switch back to Manual goes on after the last Manual number (never repeats)
do $$
begin
  perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN01'), 'manual', 'TAX/2026/', 201, 6, true);
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.t_issue('MAN01', '2026-12');
  if r->>'ref' <> 'TAX/2026/000202' then raise exception 'Manual must continue after the last number: %', r; end if;
end
$$;
reset role;

-- 6. Fixed width: when the number would need more digits, nothing is issued (the overall number is not used either).
do $$
begin
  perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN04'), 'manual', 'F-', 998, 3, false);
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d07');
set role authenticated;
do $$
declare r jsonb; failed boolean; regs bigint;
begin
  r := public.t_issue('MAN04', '2026-10');
  if r->>'ref' <> 'F-998' then raise exception 'fixed width first: %', r; end if;
  r := public.t_issue('MAN04', '2026-10');
  if r->>'ref' <> 'F-999' then raise exception 'fixed width second: %', r; end if;
  failed := false;
  begin perform public.t_issue('MAN04', '2026-10'); exception when others then failed := sqlerrm like '%invoice-numbers-used-up%'; end;
  if not failed then raise exception 'fixed width should refuse the 1000th number'; end if;
  failed := false;
  begin perform public.t_issue('MAN04', '2026-10'); exception when others then failed := sqlerrm like '%invoice-numbers-used-up%'; end;
  if not failed then raise exception 'fixed width should keep refusing'; end if;
end
$$;
reset role;
do $$
declare p uuid := public.t_pid('MAN04');
begin
  -- the refused attempts left nothing behind: two issued, overall numbers 1 and 2 only
  if (select count(*) from public.maha_invoice_register where property_id = p) <> 2 then raise exception 'a refused number used an overall number'; end if;
  -- the provider can switch to unlimited: the number just grows longer
  perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', p, 'manual', 'F-', 999, 3, true);
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d07');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.t_issue('MAN04', '2026-10');
  if r->>'ref' <> 'F-1000' then raise exception 'unlimited should grow: %', r; end if;
end
$$;
reset role;

-- 7. Manual with no format saved is refused (the page tells the provider to set it first)
do $$
begin
  update public.maha_properties set invoice_mode = 'manual', invoice_start = null where property_code = 'MAN01';
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare failed boolean;
begin
  failed := false;
  begin perform public.t_issue('MAN01', '2026-10'); exception when others then failed := sqlerrm like '%invoice-format-missing%'; end;
  if not failed then raise exception 'Manual without a saved format should be refused'; end if;
end
$$;
reset role;
update public.maha_properties set invoice_mode = 'standard', invoice_start = 1 where property_code = 'MAN01';

-- 8. One series for the whole chain (Manual): typed once for the chain, all hotels of the chain share one counter.
do $$
declare org uuid := (select organization_id from public.maha_properties where property_code = 'MAN02'); r jsonb;
begin
  perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000d01', org, 'chain');
  r := public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN02'), 'manual', 'GRP-', 5000, 6, true);
  if (r->>'on_chain')::boolean is not true then raise exception 'the format of a chain series should be kept on the chain: %', r; end if;
  if (select invoice_prefix from public.maha_organizations where id = org) <> 'GRP-' or (select invoice_start from public.maha_organizations where id = org) <> 5000 then
    raise exception 'the chain row did not get the format';
  end if;
  if (select invoice_prefix from public.maha_properties where id = public.t_pid('MAN02')) is not null then raise exception 'the hotel row should not hold the chain format'; end if;
  perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN03'), 'manual', 'GRP-', 5000, 6, true);
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d03');
set role authenticated;
do $$ begin if public.t_issue('MAN02', '2026-10')->>'ref' <> 'GRP-005000' then raise exception 'chain first number wrong'; end if; end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000d04');
set role authenticated;
do $$ begin if public.t_issue('MAN03', '2026-10')->>'ref' <> 'GRP-005001' then raise exception 'the other hotel of the chain should take 5001'; end if; end $$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000d03');
set role authenticated;
do $$ begin
  if public.t_issue('MAN02', '2026-10')->>'ref' <> 'GRP-005002' then raise exception 'chain third number wrong'; end if;
  if public.t_issue('MAN02', '2027-01')->>'ref' <> 'GRP-005003' then raise exception 'a new month must not restart a Manual chain number'; end if;
end $$;
reset role;

-- 9. Provider read for a chain hotel, and the starting-number rule uses the whole chain
select public.t_as('00000000-0000-0000-0000-000000000d01');
set role authenticated;
do $$
declare f jsonb;
begin
  f := public.maha_invoice_format_of(public.t_pid('MAN03'));
  if f->>'scope' <> 'chain' or f->>'prefix' <> 'GRP-' or (f->>'next_number')::int <> 5004 or f->>'chain_code' <> 'MANCHAIN1' then raise exception 'chain format_of wrong: %', f; end if;
end
$$;
reset role;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN03'), 'manual', 'GRP-', 5001, 6, true); exception when invalid_parameter_value then failed := true; end;
  if not failed then raise exception 'a chain starting number below the highest issued by any hotel was accepted'; end if;
end
$$;

-- 10. Another provider cannot read it; a signed-in hotel user cannot read it either
select public.t_as('00000000-0000-0000-0000-000000000d05');
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_invoice_format_of(public.t_pid('MAN01')); exception when others then failed := true; end;
  if not failed then raise exception 'another provider read the format'; end if;
end
$$;
reset role;
select public.t_as('00000000-0000-0000-0000-000000000d02');
set role authenticated;
do $$
declare failed boolean := false;
begin
  begin perform public.maha_invoice_format_of(public.t_pid('MAN01')); exception when others then failed := true; end;
  if not failed then raise exception 'a hotel user read the provider format page'; end if;
end
$$;
reset role;

-- 11. Going back to one series per hotel never repeats a number: the hotels start from what the chain already used
do $$
declare org uuid := (select organization_id from public.maha_properties where property_code = 'MAN02');
begin
  perform public.maha_set_invoice_scope('00000000-0000-0000-0000-000000000d01', org, 'hotel');
  perform public.maha_set_invoice_format('00000000-0000-0000-0000-000000000d01', public.t_pid('MAN02'), 'manual', 'GRP-', 5004, 6, true);
end
$$;
select public.t_as('00000000-0000-0000-0000-000000000d03');
set role authenticated;
do $$ begin if public.t_issue('MAN02', '2027-01')->>'ref' <> 'GRP-005004' then raise exception 'own series after the chain should go on from 5004'; end if; end $$;
reset role;

rollback;
