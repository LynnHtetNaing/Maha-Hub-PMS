-- Maha Hub cloud database
-- Run this once in the Supabase SQL editor (Project → SQL → New query).
-- Then, in Maha Hub, open Cloud database and paste the project URL and the anon public key.
-- The first Connect chooses the passphrase. Type the same passphrase on every other computer.
-- Full card numbers are rejected here. They stay in the browser that took the payment.

create extension if not exists pgcrypto;

create table if not exists maha_secret (
  id int primary key default 1 check (id = 1),
  pass_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists maha_cloud (
  id text primary key default 'db' check (id = 'db'),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

alter table maha_secret enable row level security;
alter table maha_cloud enable row level security;
revoke all on table maha_secret from public, anon, authenticated;
revoke all on table maha_cloud from public, anon, authenticated;

create or replace function maha_check(pass text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare h text;
begin
  select pass_hash into h from maha_secret where id = 1;
  if h is null then
    raise exception 'no-secret';
  end if;
  if pass is null or h <> crypt(pass, h) then
    raise exception 'unauthorized';
  end if;
end;
$$;

create or replace function maha_init(pass text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if pass is null or length(pass) < 8 then
    raise exception 'short-pass';
  end if;
  if exists (select 1 from maha_secret where id = 1) then
    raise exception 'already-set';
  end if;
  insert into maha_secret(id, pass_hash) values (1, crypt(pass, gen_salt('bf')));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function maha_pull(pass text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare row maha_cloud%rowtype;
begin
  perform maha_check(pass);
  select * into row from maha_cloud where id = 'db';
  if row.id is null then
    return jsonb_build_object('empty', true);
  end if;
  return jsonb_build_object('updated_at', row.updated_at, 'payload', row.payload);
end;
$$;

create or replace function maha_push(pass text, payload jsonb, client_updated timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cur timestamptz;
begin
  perform maha_check(pass);
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'bad-payload';
  end if;
  if payload ? 'cardVault' or payload ? 'session' then
    raise exception 'card-data';
  end if;
  if exists (
    select 1 from jsonb_path_query(payload, '$.**') as val
    where jsonb_typeof(val) = 'object' and (val ? 'pan' or val ? 'cvc' or val ? 'cvv')
  ) then
    raise exception 'card-data';
  end if;
  select updated_at into cur from maha_cloud where id = 'db';
  if cur is not null and client_updated is not null and client_updated < cur then
    return jsonb_build_object(
      'conflict', true,
      'updated_at', cur,
      'payload', (select c.payload from maha_cloud c where c.id = 'db')
    );
  end if;
  insert into maha_cloud(id, updated_at, payload)
  values ('db', coalesce(client_updated, now()), payload)
  on conflict (id) do update
    set updated_at = excluded.updated_at,
        payload = excluded.payload;
  return jsonb_build_object('ok', true, 'updated_at', coalesce(client_updated, now()));
end;
$$;

revoke all on function maha_check(text) from public, anon, authenticated;
grant execute on function maha_init(text) to anon, authenticated;
grant execute on function maha_pull(text) to anon, authenticated;
grant execute on function maha_push(text, jsonb, timestamptz) to anon, authenticated;
