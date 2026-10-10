-- Maha Hub: permanent server-side activity log (who did what, when).
--
-- Written ONLY by the trusted server functions (service role): provider actions (hotel created, staff added,
-- login disabled/enabled, password reset sent, username changed, requests refused for missing two-step) and
-- sign-ins (successful, and failed for a username that exists).
-- Read ONLY by the provider (platform admin, with a code-verified session once two-step is enrolled), through
-- maha_recent_activity(). Browsers have no direct access to the table. Never stores passwords, tokens, emails
-- or card data: only the event name, the username, the hotel code and a short reason.

begin;

create table if not exists public.maha_activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user uuid,
  actor_username text,
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  target text,
  property_code text,
  ok boolean not null default true,
  detail text
);
create index if not exists maha_activity_log_at_idx on public.maha_activity_log(at desc, id desc);
create index if not exists maha_activity_log_property_idx on public.maha_activity_log(property_code, at desc);

alter table public.maha_activity_log enable row level security;
revoke all on public.maha_activity_log from public, anon, authenticated;

-- Write one event (service role only). Inputs are trimmed; repeated failed sign-ins for one user are throttled
-- so a guessing attack cannot flood the table; entries older than 400 days are removed now and then.
create or replace function public.maha_log_event(
  p_actor_user uuid,
  p_actor_username text,
  p_event text,
  p_target text,
  p_property_code text,
  p_ok boolean,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := left(nullif(trim(coalesce(p_actor_username, '')), ''), 60);
begin
  if p_event is null or p_event !~ '^[a-z_]{3,40}$' then
    return;
  end if;

  if p_event = 'sign_in_failed' and v_user is not null then
    if (select count(*) from public.maha_activity_log
        where event = 'sign_in_failed' and actor_username = v_user and at > now() - interval '10 minutes') >= 10 then
      return;
    end if;
  end if;

  insert into public.maha_activity_log(actor_user, actor_username, event, target, property_code, ok, detail)
  values (
    p_actor_user,
    v_user,
    p_event,
    left(nullif(trim(coalesce(p_target, '')), ''), 80),
    left(upper(nullif(trim(coalesce(p_property_code, '')), '')), 24),
    coalesce(p_ok, true),
    left(nullif(trim(coalesce(p_detail, '')), ''), 200)
  );

  if random() < 0.01 then
    delete from public.maha_activity_log where at < now() - interval '400 days';
  end if;
end;
$$;

-- Read the newest events (provider only).
create or replace function public.maha_recent_activity(p_limit integer default 100, p_property text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r))
    from (
      select l.id, l.at, l.actor_username, l.event, l.target, l.property_code, l.ok, l.detail
      from public.maha_activity_log l
      where p_property is null or l.property_code = upper(p_property)
      order by l.at desc, l.id desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.maha_log_event(uuid, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.maha_log_event(uuid, text, text, text, text, boolean, text) to service_role;
revoke all on function public.maha_recent_activity(integer, text) from public, anon;
grant execute on function public.maha_recent_activity(integer, text) to authenticated;

commit;
