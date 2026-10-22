-- Regression: authenticated owners cannot change organization ownership through table UPDATE.
-- The target UUID need not exist: the trigger must reject ownership change before FK validation.
begin;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select owner_user_id::text from public.maha_organizations order by id limit 1),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  (select owner_user_id::text from public.maha_organizations order by id limit 1),
  true
);

set local role authenticated;

do $test$
declare
  v_org uuid;
begin
  select id into v_org from public.maha_organizations order by id limit 1;
  if v_org is null then raise exception 'test_requires_organization'; end if;

  begin
    update public.maha_organizations
    set owner_user_id = '00000000-0000-0000-0000-000000000001'
    where id = v_org;
    raise exception 'assertion_failed_owner_transfer_was_allowed';
  exception when sqlstate '42501' then
    null;
  end;
end
$test$;

reset role;
rollback;
