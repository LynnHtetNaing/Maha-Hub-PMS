-- Username identity / platform owner boundary smoke tests.
-- Disposable PostgreSQL CI only. This is not a real Supabase Auth integration test.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000101', 'platform-owner@example.test'),
 ('00000000-0000-0000-0000-000000000102', 'hotel-staff@example.test');

insert into public.maha_login_identities(user_id, username, recovery_email) values
 ('00000000-0000-0000-0000-000000000101', 'MahaOwner', 'platform-owner@example.test'),
 ('00000000-0000-0000-0000-000000000102', 'hotel.frontdesk', 'hotel-staff@example.test');

insert into public.maha_platform_admins(user_id, note)
values ('00000000-0000-0000-0000-000000000101', 'CI fixture');

do $$
begin
  if (select count(*) from public.maha_login_identities) <> 2 then
    raise exception 'expected two username identity fixtures';
  end if;
  if has_table_privilege('anon', 'public.maha_login_identities', 'select')
     or has_table_privilege('authenticated', 'public.maha_login_identities', 'select')
     or has_table_privilege('authenticated', 'public.maha_login_identities', 'insert') then
    raise exception 'browser roles unexpectedly have access to private username mappings';
  end if;
  if has_table_privilege('authenticated', 'public.maha_platform_admins', 'select')
     or has_table_privilege('authenticated', 'public.maha_platform_admins', 'insert') then
    raise exception 'browser role unexpectedly has direct access to platform admin table';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', false);
set role authenticated;
do $$
begin
  if public.maha_is_platform_admin() is not true then
    raise exception 'platform owner was not recognized';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', false);
set role authenticated;
do $$
begin
  if public.maha_is_platform_admin() is not false then
    raise exception 'hotel staff unexpectedly received platform owner access';
  end if;
end
$$;
reset role;

-- Username normalization is unique, so case variants cannot create duplicate logins.
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.maha_login_identities(user_id, username, recovery_email)
    values ('00000000-0000-0000-0000-000000000102', 'MAHAOWNER', 'other@example.test');
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'case-insensitive username uniqueness was not enforced';
  end if;
end
$$;

rollback;
