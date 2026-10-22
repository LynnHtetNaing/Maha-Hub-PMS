-- Regression: the owner-change trigger rejects an attempted ownership transfer.
-- Use a temporary fixture so the test does not require customer or seed organizations.
begin;

create temporary table owner_transfer_fixture(owner_user_id uuid);
insert into owner_transfer_fixture values ('00000000-0000-0000-0000-000000000002');

create trigger owner_transfer_fixture_guard
before update of owner_user_id on owner_transfer_fixture
for each row execute function public.maha_prevent_org_owner_change();

do $test$
begin
  begin
    update owner_transfer_fixture
    set owner_user_id = '00000000-0000-0000-0000-000000000001';
    raise exception 'assertion_failed_owner_transfer_was_allowed';
  exception when sqlstate '42501' then
    null;
  end;

  if (select owner_user_id from owner_transfer_fixture) <> '00000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'assertion_failed_owner_changed';
  end if;
end
$test$;

rollback;
