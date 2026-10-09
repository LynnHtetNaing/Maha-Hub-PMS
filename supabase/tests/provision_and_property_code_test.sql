-- Global property code uniqueness + atomic provisioning tests.
-- Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000201', 'owner@example.test'),
 ('00000000-0000-0000-0000-000000000202', 'staff-a@example.test'),
 ('00000000-0000-0000-0000-000000000203', 'staff-b@example.test'),
 ('00000000-0000-0000-0000-000000000204', 'staff-c@example.test');

-- Browser roles must not be able to provision.
do $$
begin
  if has_function_privilege('authenticated', 'public.maha_provision_hotel(uuid,text,uuid,text,text,uuid,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.maha_provision_hotel(uuid,text,uuid,text,text,uuid,text,text,text)', 'execute') then
    raise exception 'browser roles can execute maha_provision_hotel';
  end if;
end
$$;

-- Happy path: new organization + property + identity + membership.
select public.maha_provision_hotel(null, 'Org One', '00000000-0000-0000-0000-000000000201',
  'Hotel A', 'hta01', '00000000-0000-0000-0000-000000000202', 'staff.a', 'staff-a@example.test', 'staff');

do $$
begin
  if (select property_code from public.maha_properties) <> 'HTA01' then
    raise exception 'property code was not normalised to upper case';
  end if;
  if (select count(*) from public.maha_memberships) <> 1 then
    raise exception 'expected exactly one membership';
  end if;
end
$$;

-- Same code in a DIFFERENT organization is rejected, and nothing is left behind.
do $$
declare rejected boolean := false;
begin
  begin
    perform public.maha_provision_hotel(null, 'Org Two', '00000000-0000-0000-0000-000000000201',
      'Hotel B', 'HTA01', '00000000-0000-0000-0000-000000000203', 'staff.b', 'staff-b@example.test', 'staff');
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'duplicate property code across organizations was accepted'; end if;
  if (select count(*) from public.maha_organizations) <> 1 then
    raise exception 'failed provisioning left an organization behind';
  end if;
  if exists (select 1 from public.maha_login_identities where username = 'staff.b') then
    raise exception 'failed provisioning left a login identity behind';
  end if;
end
$$;

-- Duplicate username fails after the property insert and still rolls everything back.
do $$
declare rejected boolean := false;
begin
  begin
    perform public.maha_provision_hotel(null, 'Org Three', '00000000-0000-0000-0000-000000000201',
      'Hotel C', 'HTC01', '00000000-0000-0000-0000-000000000204', 'STAFF.A', 'staff-c@example.test', 'staff');
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'duplicate username was accepted'; end if;
  if exists (select 1 from public.maha_properties where property_code = 'HTC01') then
    raise exception 'failed provisioning left a property behind';
  end if;
end
$$;

-- Existing organization must be owned by the stated owner.
do $$
declare rejected boolean := false; org uuid := (select id from public.maha_organizations limit 1);
begin
  begin
    perform public.maha_provision_hotel(org, null, '00000000-0000-0000-0000-000000000203',
      'Hotel D', 'HTD01', '00000000-0000-0000-0000-000000000204', 'staff.d', 'staff-c@example.test', 'staff');
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'provisioning into an organization the caller does not own was accepted'; end if;
end
$$;

-- Malformed code rejected by the table check.
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.maha_properties(organization_id, name, property_code)
    values ((select id from public.maha_organizations limit 1), 'Bad', 'x y');
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'malformed property code was accepted'; end if;
end
$$;

-- Browser roles keep only the intended table privileges (no DELETE/TRUNCATE, no direct cloud writes).
do $$
declare t text; p text;
begin
  foreach t in array array['maha_organizations','maha_properties','maha_memberships','maha_property_cloud'] loop
    foreach p in array array['DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.'||t, p) then
        raise exception 'authenticated unexpectedly has % on %', p, t;
      end if;
    end loop;
    if has_table_privilege('anon', 'public.'||t, 'SELECT') then
      raise exception 'anon unexpectedly has SELECT on %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.maha_memberships', 'INSERT')
     or has_table_privilege('authenticated', 'public.maha_memberships', 'UPDATE') then
    raise exception 'authenticated can write memberships directly';
  end if;
  if has_table_privilege('authenticated', 'public.maha_property_cloud', 'INSERT')
     or has_table_privilege('authenticated', 'public.maha_property_cloud', 'UPDATE') then
    raise exception 'authenticated can write property cloud directly';
  end if;
end
$$;

rollback;