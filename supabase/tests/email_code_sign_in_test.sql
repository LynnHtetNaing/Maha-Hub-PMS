-- Emailed sign-in code + trusted device tests. Disposable PostgreSQL CI only.
begin;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000901', 'code-a@example.test'),
 ('00000000-0000-0000-0000-000000000902', 'code-b@example.test');

-- Browsers and signed-in users can touch nothing here; only the server function (service_role) can call the functions.
do $$
begin
  if has_table_privilege('authenticated', 'public.maha_trusted_devices', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_trusted_devices', 'INSERT')
     or has_table_privilege('anon', 'public.maha_trusted_devices', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_login_challenges', 'SELECT')
     or has_table_privilege('authenticated', 'public.maha_login_challenges', 'UPDATE')
     or has_table_privilege('anon', 'public.maha_login_challenges', 'SELECT') then
    raise exception 'browser roles can touch the code tables directly';
  end if;
  if has_function_privilege('anon', 'public.maha_login_challenge_try(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_login_challenge_try(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_login_challenge_done(uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_device_trusted(uuid,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.maha_reset_trusted_devices(uuid)', 'execute') then
    raise exception 'browser roles can call the sign-in code functions';
  end if;
  if not has_function_privilege('service_role', 'public.maha_login_challenge_new(uuid,text)', 'execute') then
    raise exception 'the server function cannot start a sign-in attempt';
  end if;
end
$$;

do $$
declare
  ua uuid := '00000000-0000-0000-0000-000000000901';
  ub uuid := '00000000-0000-0000-0000-000000000902';
  dev1 text := repeat('a', 64);
  dev2 text := repeat('b', 64);
  c1 uuid; c2 uuid; r text;
begin
  -- a device nobody registered is not trusted
  if public.maha_device_trusted(ua, dev1, 30) then raise exception 'unknown device trusted'; end if;

  -- a right code always remembers the person for 30 days (the tick box no longer matters)
  c1 := public.maha_login_challenge_new(ua, dev1);
  if public.maha_login_challenge_try(c1, ua, dev1) <> 'ok' then raise exception 'first try refused'; end if;
  perform public.maha_login_challenge_done(c1, false);
  if not public.maha_device_trusted(ua, dev1, 30) then raise exception 'person not remembered after a right code'; end if;
  if public.maha_login_challenge_try(c1, ua, dev1) <> 'invalid' then raise exception 'a finished attempt can be used again'; end if;

  -- the attempt belongs to one person and one device
  c1 := public.maha_login_challenge_new(ua, dev1);
  if public.maha_login_challenge_try(c1, ub, dev1) <> 'invalid' then raise exception 'another person used this attempt'; end if;
  if public.maha_login_challenge_try(c1, ua, dev2) <> 'invalid' then raise exception 'another device used this attempt'; end if;

  -- trusted for 30 days on ANY device of that person, never for another person
  perform public.maha_login_challenge_done(c1, true);
  if not public.maha_device_trusted(ua, dev1, 30) then raise exception 'registered device not trusted'; end if;
  if not public.maha_device_trusted(ua, dev2, 30) then raise exception 'second device of the same person asked for a code again'; end if;
  if public.maha_device_trusted(ub, dev1, 30) then raise exception 'other person trusted'; end if;

  -- after 30 days a new code is needed
  update public.maha_trusted_devices set last_verified_at = now() - interval '31 days' where user_id = ua and device_hash = dev1;
  if public.maha_device_trusted(ua, dev1, 30) then raise exception 'device still trusted after 30 days'; end if;
  update public.maha_trusted_devices set last_verified_at = now() - interval '29 days' where user_id = ua and device_hash = dev1;
  if not public.maha_device_trusted(ua, dev1, 30) then raise exception 'device not trusted on day 29'; end if;

  -- typing a new code on the same device renews the 30 days (one row, not two)
  c2 := public.maha_login_challenge_new(ua, dev1);
  perform public.maha_login_challenge_done(c2, true);
  if (select count(*) from public.maha_trusted_devices where user_id = ua and device_hash = dev1) <> 1 then raise exception 'duplicate device rows'; end if;
  if (select last_verified_at from public.maha_trusted_devices where user_id = ua and device_hash = dev1) < now() - interval '1 minute' then
    raise exception 'last code date not renewed';
  end if;

  -- only 5 tries per attempt
  c1 := public.maha_login_challenge_new(ua, dev2);
  for i in 1..5 loop
    if public.maha_login_challenge_try(c1, ua, dev2) <> 'ok' then raise exception 'try % refused too early', i; end if;
  end loop;
  r := public.maha_login_challenge_try(c1, ua, dev2);
  if r <> 'locked' then raise exception 'sixth try was %', r; end if;

  -- an attempt is valid for 10 minutes only
  c1 := public.maha_login_challenge_new(ua, dev2);
  update public.maha_login_challenges set expires_at = now() - interval '1 second' where id = c1;
  if public.maha_login_challenge_try(c1, ua, dev2) <> 'expired' then raise exception 'expired attempt accepted'; end if;

  -- starting a new attempt closes the older one
  c1 := public.maha_login_challenge_new(ua, dev2);
  c2 := public.maha_login_challenge_new(ua, dev2);
  if public.maha_login_challenge_try(c1, ua, dev2) <> 'invalid' then raise exception 'older attempt still works'; end if;
  if public.maha_login_challenge_try(c2, ua, dev2) <> 'ok' then raise exception 'newest attempt refused'; end if;

  -- support reset: every trusted device of that person is forgotten
  if public.maha_reset_trusted_devices(ua) < 1 then raise exception 'reset removed nothing'; end if;
  if public.maha_device_trusted(ua, dev1, 30) then raise exception 'device still trusted after reset'; end if;

  -- an unknown device hash is refused by the table check
  begin
    perform public.maha_login_challenge_new(ua, 'not-a-hash');
    raise exception 'bad device hash accepted';
  exception when check_violation then null;
  end;
end
$$;

rollback;
