-- User logs: every action a person does in a hotel, kept for ever (no time limit).
--
-- * Append only. There is no policy and no grant on the table itself, so no signed-in user can read, change or
--   delete a line directly. Lines go in through maha_user_logs_push and come out through maha_user_logs_pull.
-- * The lines are NOT part of the hotel's record sync (maha_records), so a large history never slows the hotel file.
-- * Each line is stamped with the real sign-in account (auth.uid()) next to the name the app shows.
-- * Idempotent: sending the same line twice stores it once (primary key property_id + id).

create table if not exists public.maha_user_logs (
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  id          text not null check (length(id) between 8 and 60),
  at          timestamptz not null,
  bd          date,
  user_id     uuid,
  user_name   text not null default '' check (length(user_name) <= 80),
  shift       text not null default '' check (length(shift) <= 40),
  title       text not null default 'Other' check (length(title) <= 40),
  action      text not null check (length(action) between 1 and 800),
  ref         text check (ref is null or length(ref) <= 80),
  received_at timestamptz not null default now(),
  primary key (property_id, id)
);

create index if not exists maha_user_logs_bd_idx    on public.maha_user_logs(property_id, bd desc, at desc);
create index if not exists maha_user_logs_user_idx  on public.maha_user_logs(property_id, user_name, at desc);
create index if not exists maha_user_logs_title_idx on public.maha_user_logs(property_id, title, at desc);

alter table public.maha_user_logs enable row level security;
revoke all on public.maha_user_logs from public, anon, authenticated;

-- Send a batch of lines (up to 300). A bad line is skipped, the rest are kept. Returns how many were new.
create or replace function public.maha_user_logs_push(target_property uuid, lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n integer := 0;
  l jsonb;
  v_at timestamptz;
begin
  if uid is null then
    raise exception 'not-signed-in' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) > 300 then
    raise exception 'bad-batch' using errcode = '22023';
  end if;
  for l in select * from jsonb_array_elements(lines) loop
    begin
      v_at := least((l->>'at')::timestamptz, now() + interval '5 minutes');
      insert into public.maha_user_logs (property_id, id, at, bd, user_id, user_name, shift, title, action, ref)
      values (
        target_property,
        left(l->>'id', 60),
        v_at,
        nullif(l->>'bd', '')::date,
        uid,
        left(coalesce(l->>'user', ''), 80),
        left(coalesce(l->>'shift', ''), 40),
        left(coalesce(nullif(l->>'t', ''), 'Other'), 40),
        left(coalesce(l->>'a', ''), 800),
        left(nullif(l->>'ref', ''), 80)
      )
      on conflict (property_id, id) do nothing;
      if found then n := n + 1; end if;
    exception when others then
      continue;
    end;
  end loop;
  return n;
end;
$$;

-- Read lines for one hotel between two business dates, newest first, with the total for the page numbers.
-- Hotel staff with access to the property and the platform provider can read; nobody else.
create or replace function public.maha_user_logs_pull(
  target_property uuid,
  from_bd date,
  to_bd date,
  p_title text default null,
  p_user text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_total bigint;
  v_rows jsonb;
begin
  if uid is null then
    raise exception 'not-signed-in' using errcode = '28000';
  end if;
  if not (public.maha_can_access_property(target_property) or public.maha_is_platform_admin()) then
    raise exception 'not-allowed' using errcode = '42501';
  end if;
  select count(*) into v_total
  from public.maha_user_logs g
  where g.property_id = target_property
    and g.bd between from_bd and to_bd
    and (p_title is null or p_title = '' or g.title = p_title)
    and (p_user is null or p_user = '' or g.user_name = p_user);
  select coalesce(jsonb_agg(r order by r.at desc, r.id desc), '[]'::jsonb) into v_rows
  from (
    select g.id, g.at, g.bd, g.user_name as "user", g.shift, g.title as t, g.action as a, g.ref
    from public.maha_user_logs g
    where g.property_id = target_property
      and g.bd between from_bd and to_bd
      and (p_title is null or p_title = '' or g.title = p_title)
      and (p_user is null or p_user = '' or g.user_name = p_user)
    order by g.at desc, g.id desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  ) r;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.maha_user_logs_push(uuid, jsonb) from public, anon;
revoke all on function public.maha_user_logs_pull(uuid, date, date, text, text, integer, integer) from public, anon;
grant execute on function public.maha_user_logs_push(uuid, jsonb) to authenticated;
grant execute on function public.maha_user_logs_pull(uuid, date, date, text, text, integer, integer) to authenticated;
