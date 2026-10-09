-- Integration smoke tests for tenant migrations.
-- Run only in disposable PostgreSQL/Supabase staging. Expected to run as database owner.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000001', 'owner-a@example.test'),
 ('00000000-0000-0000-0000-000000000002', 'owner-b@example.test'),
 ('00000000-0000-0000-0000-000000000003', 'staff-a@example.test'),
 ('00000000-0000-0000-0000-000000000004', 'readonly-a@example.test');

-- Each owner creates only their own organization and property through the authenticated API.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
insert into public.maha_organizations(id, name, owner_user_id)
values ('00000000-0000-0000-0000-000000000011', 'Organization A', '00000000-0000-0000-0000-000000000001');
insert into public.maha_properties(id, organization_id, name, property_code)
values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'Hotel A', 'HOTEL-A');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
insert into public.maha_organizations(id, name, owner_user_id)
values ('00000000-0000-0000-0000-000000000012', 'Organization B', '00000000-0000-0000-0000-000000000002');
insert into public.maha_properties(id, organization_id, name, property_code)
values ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000012', 'Hotel B', 'HOTEL-B');
reset role;

insert into public.maha_memberships(organization_id, property_id, user_id, role, active) values
 ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'staff', true),
 ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000004', 'read_only', true);

-- Independent owner can save Organization B's payload.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.maha_save_property_cloud(
    '00000000-0000-0000-0000-000000000022',
    '{"hotel":"B","rooms":[]}'::jsonb,
    0
  );
  if coalesce((r->>'ok')::boolean, false) is not true then
    raise exception 'owner B initial save failed: %', r;
  end if;
end
$$;
reset role;

-- Staff for A can save A, but must not read B. Version mismatch must return conflict.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare r jsonb; visible_b integer;
begin
  r := public.maha_save_property_cloud(
    '00000000-0000-0000-0000-000000000021',
    '{"hotel":"A","rooms":[]}'::jsonb,
    0
  );
  if coalesce((r->>'ok')::boolean, false) is not true then
    raise exception 'staff A initial save failed: %', r;
  end if;

  select count(*) into visible_b
  from public.maha_property_cloud
  where property_id = '00000000-0000-0000-0000-000000000022';
  if visible_b <> 0 then
    raise exception 'cross-tenant payload leak: staff A can see hotel B';
  end if;

  r := public.maha_save_property_cloud(
    '00000000-0000-0000-0000-000000000021',
    '{"hotel":"A","rooms":[{"number":"101"}]}'::jsonb,
    0
  );
  if coalesce((r->>'conflict')::boolean, false) is not true then
    raise exception 'stale version should conflict: %', r;
  end if;
end
$$;

-- Read-only staff may read their property but cannot save it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
do $$
declare r jsonb; rejected boolean := false;
begin
  if public.maha_get_property_cloud('00000000-0000-0000-0000-000000000021')->>'payload' is null then
    raise exception 'read-only user should be able to read assigned property';
  end if;

  begin
    r := public.maha_save_property_cloud(
      '00000000-0000-0000-0000-000000000021',
      '{"hotel":"A","rooms":[]}'::jsonb,
      1
    );
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'read-only user unexpectedly saved payload';
  end if;
end
$$;

-- Server-side sensitive-field rejection covers nested object and array content.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.maha_save_property_cloud(
      '00000000-0000-0000-0000-000000000021',
      '{"hotel":"A","settings":{"stripe":{"secret":"sk_test_not_real"}}}'::jsonb,
      1
    );
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Stripe secret payload should have been rejected';
  end if;

  rejected := false;
  begin
    perform public.maha_save_property_cloud(
      '00000000-0000-0000-0000-000000000021',
      '{"hotel":"A","guests":[{"payment":{"pan":"4111111111111111"}}]}'::jsonb,
      1
    );
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then
    raise exception 'card PAN payload should have been rejected';
  end if;
end
$$;
reset role;

-- An unrelated tenant must not read A or B, and an inactive member must lose access.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare visible_a integer;
begin
  select count(*) into visible_a
  from public.maha_property_cloud
  where property_id = '00000000-0000-0000-0000-000000000021';
  if visible_a <> 0 then
    raise exception 'cross-tenant payload leak: owner B can see hotel A';
  end if;
end
$$;
reset role;

update public.maha_memberships
set active = false
where user_id = '00000000-0000-0000-0000-000000000003';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.maha_get_property_cloud('00000000-0000-0000-0000-000000000021');
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'inactive member unexpectedly retained access';
  end if;
end
$$;
reset role;

rollback;
