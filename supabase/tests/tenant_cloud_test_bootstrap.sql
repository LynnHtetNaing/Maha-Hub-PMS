-- Minimal Supabase Auth compatibility layer for disposable PostgreSQL CI only.
-- Never use this file against a real Supabase project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Mirror Supabase: new public tables get full privileges for anon/authenticated by default.
-- Migrations must narrow these (see 20261009_005_harden_table_grants.sql).
alter default privileges in schema public grant all on tables to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
