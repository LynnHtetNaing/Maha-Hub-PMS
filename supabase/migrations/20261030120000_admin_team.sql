-- Provider Admin team + Admin logs.
-- One Master admin (the original owner account); other admins are invited by the Master, can be switched off,
-- and see the hotels the Master gives them. Admin logs are saved in the cloud and only the Master can read them.
-- Not applied automatically. Run only after the owner has approved it.
begin;

alter table public.maha_platform_admins add column if not exists is_master boolean not null default false;
alter table public.maha_platform_admins add column if not exists active boolean not null default true;
alter table public.maha_platform_admins add column if not exists all_hotels boolean not null default true;
alter table public.maha_platform_admins add column if not exists name text not null default '';
alter table public.maha_platform_admins add column if not exists email text not null default '';
alter table public.maha_platform_admins add column if not exists invited_at timestamptz;
alter table public.maha_platform_admins add column if not exists created_by uuid;

-- The Master is the sign-in named mahaadmin; when there is none, the oldest platform admin.
update public.maha_platform_admins a set is_master = true
 where not exists (select 1 from public.maha_platform_admins where is_master)
   and a.user_id = coalesce(
     (select i.user_id from public.maha_login_identities i
        join public.maha_platform_admins x on x.user_id = i.user_id
       where i.username_normalized = 'mahaadmin'),
     (select user_id from public.maha_platform_admins order by created_at, user_id limit 1));

create unique index if not exists maha_platform_admins_one_master on public.maha_platform_admins ((true)) where is_master;

-- The Master row can never be removed, switched off or demoted.
create or replace function public.maha_guard_master_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_master then raise exception 'master-admin-protected' using errcode = '42501'; end if;
    return old;
  end if;
  if old.is_master and (new.is_master is distinct from true or new.active is distinct from true or new.user_id <> old.user_id) then
    raise exception 'master-admin-protected' using errcode = '42501';
  end if;
  if not old.is_master and new.is_master then
    raise exception 'master-admin-protected' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists maha_guard_master_admin_trg on public.maha_platform_admins;
create trigger maha_guard_master_admin_trg before update or delete on public.maha_platform_admins
  for each row execute function public.maha_guard_master_admin();

-- A switched-off admin is no longer a platform admin.
create or replace function public.maha_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_platform_admins a
    where a.user_id = (select auth.uid()) and a.active
  );
$$;

create or replace function public.maha_is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_platform_admins a
    where a.user_id = (select auth.uid()) and a.active and a.is_master
  );
$$;
revoke all on function public.maha_is_master_admin() from public, anon;
grant execute on function public.maha_is_master_admin() to authenticated;

-- Who am I (for the menu): master or ordinary admin.
create or replace function public.maha_admin_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select jsonb_build_object('is_master', a.is_master, 'active', a.active, 'name', a.name)
                     from public.maha_platform_admins a where a.user_id = (select auth.uid())), '{}'::jsonb);
$$;
revoke all on function public.maha_admin_me() from public, anon;
grant execute on function public.maha_admin_me() to authenticated;

-- Hotels one admin may open. Hotels are those of the Master's organizations: all of them (organisation-wide access,
-- so hotels added later are included) or a chosen list.
create or replace function public.maha_admin_apply_hotels(p_master uuid, p_user uuid, p_all boolean, p_codes text[], p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.maha_platform_admins where user_id = p_master and is_master and active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.maha_platform_admins where user_id = p_user and is_master) then
    raise exception 'master-admin-protected' using errcode = '42501';
  end if;
  delete from public.maha_memberships m
   where m.user_id = p_user and m.organization_id in (select id from public.maha_organizations where owner_user_id = p_master);
  if p_all then
    insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
    select o.id, null, p_user, 'org_admin', p_active from public.maha_organizations o where o.owner_user_id = p_master;
  else
    insert into public.maha_memberships(organization_id, property_id, user_id, role, active)
    select p.organization_id, p.id, p_user, 'property_admin', p_active
      from public.maha_properties p join public.maha_organizations o on o.id = p.organization_id
     where o.owner_user_id = p_master and p.deleted_at is null and upper(p.property_code) = any (select upper(x) from unnest(coalesce(p_codes, '{}')) x);
  end if;
  update public.maha_platform_admins set all_hotels = p_all where user_id = p_user;
end;
$$;
revoke all on function public.maha_admin_apply_hotels(uuid, uuid, boolean, text[], boolean) from public, anon, authenticated;
grant execute on function public.maha_admin_apply_hotels(uuid, uuid, boolean, text[], boolean) to service_role;

-- New admin (called by the trusted server after it created the sign-in).
create or replace function public.maha_provision_admin(p_master uuid, p_user uuid, p_username text, p_email text, p_name text, p_all boolean, p_codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.maha_platform_admins where user_id = p_master and is_master and active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.maha_login_identities(user_id, username, recovery_email) values (p_user, p_username, p_email);
  insert into public.maha_platform_admins(user_id, note, is_master, active, all_hotels, name, email, invited_at, created_by)
  values (p_user, 'invited admin', false, true, coalesce(p_all, true), left(coalesce(p_name, ''), 80), p_email, now(), p_master);
  perform public.maha_admin_apply_hotels(p_master, p_user, coalesce(p_all, true), p_codes, true);
end;
$$;
revoke all on function public.maha_provision_admin(uuid, uuid, text, text, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.maha_provision_admin(uuid, uuid, text, text, text, boolean, text[]) to service_role;

-- Switch an admin on or off (the trusted server also bans/unbans the sign-in so the person is signed out at once).
create or replace function public.maha_admin_set_active(p_master uuid, p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.maha_platform_admins where user_id = p_master and is_master and active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.maha_platform_admins where user_id = p_user and is_master) then
    raise exception 'master-admin-protected' using errcode = '42501';
  end if;
  update public.maha_platform_admins set active = p_active where user_id = p_user;
  update public.maha_memberships set active = p_active
   where user_id = p_user and organization_id in (select id from public.maha_organizations where owner_user_id = p_master);
end;
$$;
revoke all on function public.maha_admin_set_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.maha_admin_set_active(uuid, uuid, boolean) to service_role;

-- Remove an admin completely (the trusted server then deletes the sign-in).
create or replace function public.maha_admin_remove(p_master uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.maha_platform_admins where user_id = p_master and is_master and active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.maha_platform_admins where user_id = p_user and is_master) then
    raise exception 'master-admin-protected' using errcode = '42501';
  end if;
  delete from public.maha_memberships where user_id = p_user and organization_id in (select id from public.maha_organizations where owner_user_id = p_master);
  delete from public.maha_platform_admins where user_id = p_user and not is_master;
  delete from public.maha_login_identities where user_id = p_user;
end;
$$;
revoke all on function public.maha_admin_remove(uuid, uuid) from public, anon, authenticated;
grant execute on function public.maha_admin_remove(uuid, uuid) to service_role;

-- The team list, for the Master only. Status: master / active / invited (never signed in) / off.
create or replace function public.maha_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.maha_is_master_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'username', i.username, 'name', a.name, 'email', coalesce(nullif(a.email, ''), i.recovery_email),
      'is_master', a.is_master, 'active', a.active, 'all_hotels', a.all_hotels,
      'status', case when a.is_master then 'master' when not a.active then 'off' when u.last_sign_in_at is null then 'invited' else 'active' end,
      'last_sign_in', u.last_sign_in_at,
      'hotels', coalesce((select jsonb_agg(upper(p.property_code) order by p.property_code)
                            from public.maha_memberships m
                            join public.maha_properties p on p.organization_id = m.organization_id and (m.property_id is null or m.property_id = p.id)
                           where m.user_id = a.user_id and p.deleted_at is null and p.property_code is not null), '[]'::jsonb)
    ) order by a.is_master desc, i.username)
    from public.maha_platform_admins a
    join public.maha_login_identities i on i.user_id = a.user_id
    left join auth.users u on u.id = a.user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.maha_admin_list() from public, anon;
grant execute on function public.maha_admin_list() to authenticated;

-- ------------------------------------------------------------------ Admin logs
create table if not exists public.maha_admin_logs (
  id          text primary key check (length(id) between 8 and 60),
  at          timestamptz not null,
  user_id     uuid not null,
  user_name   text not null check (length(user_name) <= 80),
  hotel       text not null default '' check (length(hotel) <= 24),
  title       text not null default 'Other' check (length(title) <= 40),
  action      text not null check (length(action) between 1 and 800),
  received_at timestamptz not null default now()
);
create index if not exists maha_admin_logs_at_idx on public.maha_admin_logs(at desc);
create index if not exists maha_admin_logs_user_idx on public.maha_admin_logs(user_name, at desc);
alter table public.maha_admin_logs enable row level security;
revoke all on public.maha_admin_logs from public, anon, authenticated;

-- An admin sends the lines of what they did. The name on every line is the real sign-in name, never what the browser says.
create or replace function public.maha_admin_logs_push(lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  uname text;
  n integer := 0;
  l jsonb;
  v_at timestamptz;
begin
  if uid is null then raise exception 'not-signed-in' using errcode = '28000'; end if;
  if not public.maha_is_platform_admin() then raise exception 'not-allowed' using errcode = '42501'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) > 300 then
    raise exception 'bad-batch' using errcode = '22023';
  end if;
  select i.username into uname from public.maha_login_identities i where i.user_id = uid;
  uname := coalesce(uname, 'admin');
  for l in select * from jsonb_array_elements(lines) loop
    begin
      v_at := (l->>'at')::timestamptz;
      insert into public.maha_admin_logs(id, at, user_id, user_name, hotel, title, action)
      values (left(l->>'id', 60), least(v_at, now() + interval '5 minutes'), uid, uname,
              left(coalesce(l->>'hotel', ''), 24), left(coalesce(nullif(l->>'t', ''), 'Other'), 40), left(l->>'a', 800))
      on conflict (id) do nothing;
      if found then n := n + 1; end if;
    exception when others then
      null;   -- a bad line is skipped, the rest are kept
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.maha_admin_logs_push(jsonb) from public, anon;
grant execute on function public.maha_admin_logs_push(jsonb) to authenticated;

-- Only the Master reads the lines.
create or replace function public.maha_admin_logs_pull(p_from timestamptz, p_to timestamptz, p_admin text, p_hotel text, p_title text, p_q text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.maha_is_master_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'at', r.at, 'user', r.user_name, 'hotel', r.hotel, 't', r.title, 'a', r.action) order by r.at desc, r.id)
    from (
      select * from public.maha_admin_logs g
       where (p_from is null or g.at >= p_from) and (p_to is null or g.at < p_to)
         and (coalesce(p_admin, '') = '' or g.user_name = p_admin)
         and (coalesce(p_hotel, '') = '' or g.hotel = upper(p_hotel))
         and (coalesce(p_title, '') = '' or g.title = p_title)
         and (coalesce(p_q, '') = '' or g.action ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%')
       order by g.at desc, g.id
       limit least(greatest(coalesce(p_limit, 200), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)
    ) r
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.maha_admin_logs_pull(timestamptz, timestamptz, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.maha_admin_logs_pull(timestamptz, timestamptz, text, text, text, text, integer, integer) to authenticated;

commit;
