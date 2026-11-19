-- Maha Hub: provider-wide settings in the cloud (code catalog + payment logos).
--
-- These two things belong to the whole system, not to one hotel, so they were only saved in the browser of the
-- provider's own computer. They now live here so every device of the provider, and every hotel's staff, sees the
-- same ones.
--   * READ : the provider (code-verified session once two-step is enrolled) and any signed-in hotel staff member
--            (an active membership). Hotel staff therefore see new codes and logos.
--   * WRITE: only the provider (platform admin, code-verified session). Every change checks the version it was
--            based on, so two devices cannot silently overwrite each other, and is recorded in the activity log.
-- Browsers have no direct table access; everything goes through the three functions below.

begin;

create table if not exists public.maha_platform_settings (
  key text primary key check (key in ('catalog', 'pay_logos')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create index if not exists maha_platform_settings_updated_by_idx on public.maha_platform_settings(updated_by);
alter table public.maha_platform_settings enable row level security;
revoke all on public.maha_platform_settings from public, anon, authenticated;

create or replace function public.maha_platform_settings_can_read()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.maha_is_platform_admin() and public.maha_owner_session_ok())
      or exists (
        select 1 from public.maha_memberships m
        where m.user_id = (select auth.uid()) and m.active
      );
$$;
revoke all on function public.maha_platform_settings_can_read() from public, anon, authenticated;

-- Everything: {catalog:{data,version}, pay_logos:{data,version}} (keys that were never saved are absent).
create or replace function public.maha_get_platform_settings()
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
  if not public.maha_platform_settings_can_read() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(s.key, jsonb_build_object('data', s.data, 'version', s.version))
    from public.maha_platform_settings s
  ), '{}'::jsonb);
end;
$$;

-- Only the version numbers (cheap; used to poll for changes).
create or replace function public.maha_platform_settings_versions()
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
  if not public.maha_platform_settings_can_read() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(s.key, s.version) from public.maha_platform_settings s), '{}'::jsonb);
end;
$$;

-- Save one setting (provider only). p_expected_version = the version this device last saw (0 = never saved).
-- Returns {ok, version} or, if someone saved in between, {conflict, version, data} with the current copy.
create or replace function public.maha_save_platform_setting(p_key text, p_data jsonb, p_expected_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cur public.maha_platform_settings%rowtype;
  new_version bigint;
  max_bytes integer;
  who text;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_is_platform_admin() or not public.maha_owner_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key is null or p_key not in ('catalog', 'pay_logos') then
    raise exception 'invalid-key' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid-data' using errcode = '22023';
  end if;
  max_bytes := case when p_key = 'catalog' then 300000 else 3000000 end;
  if octet_length(p_data::text) > max_bytes then
    raise exception 'too-large' using errcode = '22023';
  end if;

  select * into cur from public.maha_platform_settings where key = p_key for update;
  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      return jsonb_build_object('conflict', true, 'version', 0, 'data', null);
    end if;
    insert into public.maha_platform_settings(key, data, version, updated_by) values (p_key, p_data, 1, uid);
    new_version := 1;
  else
    if cur.version <> coalesce(p_expected_version, -1) then
      return jsonb_build_object('conflict', true, 'version', cur.version, 'data', cur.data);
    end if;
    new_version := cur.version + 1;
    update public.maha_platform_settings
    set data = p_data, version = new_version, updated_at = now(), updated_by = uid
    where key = p_key;
  end if;

  select username into who from public.maha_login_identities where user_id = uid;
  perform public.maha_log_event(uid, who, 'platform_setting_saved', p_key, null, true, 'version ' || new_version);

  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

revoke all on function public.maha_get_platform_settings() from public, anon;
revoke all on function public.maha_platform_settings_versions() from public, anon;
revoke all on function public.maha_save_platform_setting(text, jsonb, bigint) from public, anon;
grant execute on function public.maha_get_platform_settings() to authenticated;
grant execute on function public.maha_platform_settings_versions() to authenticated;
grant execute on function public.maha_save_platform_setting(text, jsonb, bigint) to authenticated;

commit;
