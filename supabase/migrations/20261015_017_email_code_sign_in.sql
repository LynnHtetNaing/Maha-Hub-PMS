-- Maha Hub: emailed sign-in code on a new device, and again every 30 days.
--
-- After the password is right, the username-auth function asks for a 6-digit code that Supabase Auth emails to the
-- address on the account. A person can tick "Register this device"; that device is then trusted for 30 days from
-- the last time a code was typed, after which a new code is asked.
--   * The trusted-device list and the sign-in attempts are kept here. Only the trusted server function (service
--     role) can read or write them; browsers and signed-in users have no access at all.
--   * Only a hash of the device id is stored (the browser keeps the real id).
--   * A sign-in attempt is valid for 10 minutes and allows 5 tries, then it is dead and a new one must be started.

begin;

create table if not exists public.maha_trusted_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.maha_trusted_devices enable row level security;
revoke all on public.maha_trusted_devices from public, anon, authenticated;

create table if not exists public.maha_login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  tries integer not null default 0,
  used boolean not null default false
);
create index if not exists maha_login_challenges_user_idx on public.maha_login_challenges(user_id);
alter table public.maha_login_challenges enable row level security;
revoke all on public.maha_login_challenges from public, anon, authenticated;

-- Is this device trusted, and was the last code typed less than p_days ago?
create or replace function public.maha_device_trusted(p_user uuid, p_device_hash text, p_days integer default 30)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_trusted_devices d
    where d.user_id = p_user and d.device_hash = p_device_hash
      and d.last_verified_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  );
$$;

-- Starts a sign-in attempt after the password was right. Returns its id. Old attempts of this person are cleaned up.
create or replace function public.maha_login_challenge_new(p_user uuid, p_device_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  delete from public.maha_login_challenges c
  where c.user_id = p_user and (c.used or c.expires_at < now() - interval '1 day');
  update public.maha_login_challenges c set used = true where c.user_id = p_user and not c.used;   -- only the newest attempt counts
  insert into public.maha_login_challenges(user_id, device_hash, expires_at)
  values (p_user, p_device_hash, now() + interval '10 minutes')
  returning id into new_id;
  return new_id;
end;
$$;

-- One try of a code. Counts the try first, so a wrong code can never be tried more than 5 times.
-- Returns 'ok' (go ahead and check the code), or 'invalid' / 'expired' / 'locked'.
create or replace function public.maha_login_challenge_try(p_id uuid, p_user uuid, p_device_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare c public.maha_login_challenges%rowtype;
begin
  select * into c from public.maha_login_challenges where id = p_id for update;
  if not found or c.user_id <> p_user or c.device_hash <> p_device_hash or c.used then return 'invalid'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.tries >= 5 then return 'locked'; end if;
  update public.maha_login_challenges set tries = tries + 1 where id = p_id;
  return 'ok';
end;
$$;

-- The right code was typed: close the attempt and, if asked, trust this device for the next 30 days.
create or replace function public.maha_login_challenge_done(p_id uuid, p_remember boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.maha_login_challenges%rowtype;
begin
  select * into c from public.maha_login_challenges where id = p_id for update;
  if not found or c.used then return; end if;
  update public.maha_login_challenges set used = true where id = p_id;
  if coalesce(p_remember, false) then
    insert into public.maha_trusted_devices(user_id, device_hash) values (c.user_id, c.device_hash)
    on conflict (user_id, device_hash) do update set last_verified_at = now();
  end if;
end;
$$;

-- Support: forget every trusted device of one person (they will be asked for a code again).
create or replace function public.maha_reset_trusted_devices(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.maha_trusted_devices where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Only the trusted server function may call these.
revoke all on function public.maha_device_trusted(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.maha_login_challenge_new(uuid, text) from public, anon, authenticated;
revoke all on function public.maha_login_challenge_try(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.maha_login_challenge_done(uuid, boolean) from public, anon, authenticated;
revoke all on function public.maha_reset_trusted_devices(uuid) from public, anon, authenticated;
grant execute on function public.maha_device_trusted(uuid, text, integer) to service_role;
grant execute on function public.maha_login_challenge_new(uuid, text) to service_role;
grant execute on function public.maha_login_challenge_try(uuid, uuid, text) to service_role;
grant execute on function public.maha_login_challenge_done(uuid, boolean) to service_role;
grant execute on function public.maha_reset_trusted_devices(uuid) to service_role;

commit;
