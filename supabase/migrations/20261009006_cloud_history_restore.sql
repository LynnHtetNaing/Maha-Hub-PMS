-- Maha Hub: server-side version history + restore for tenant cloud data.
-- Every overwrite of maha_property_cloud first archives the row being replaced (latest 20 kept
-- per property). Restoring is a trusted-server (service role) action and creates a NEW, higher
-- version, so any device holding an older version gets a conflict instead of silently overwriting
-- the restored data. Browser roles have no access to history.

begin;

create table if not exists public.maha_property_cloud_history (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  version bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null,
  updated_by uuid,
  archived_at timestamptz not null default now(),
  unique (property_id, version)
);

alter table public.maha_property_cloud_history enable row level security;
revoke all on public.maha_property_cloud_history from public, anon, authenticated;

create or replace function public.maha_archive_property_cloud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.maha_property_cloud_history(property_id, version, payload, updated_at, updated_by)
  values (old.property_id, old.version, old.payload, old.updated_at, old.updated_by)
  on conflict (property_id, version) do nothing;

  delete from public.maha_property_cloud_history h
  where h.property_id = old.property_id
    and h.id not in (
      select id from public.maha_property_cloud_history
      where property_id = old.property_id
      order by version desc
      limit 20
    );
  return new;
end;
$$;

revoke all on function public.maha_archive_property_cloud() from public, anon, authenticated;

drop trigger if exists maha_property_cloud_archive on public.maha_property_cloud;
create trigger maha_property_cloud_archive
before update on public.maha_property_cloud
for each row execute function public.maha_archive_property_cloud();

-- Service role only. Returns the new version. Fails if the version is not in history
-- (or is the current one: nothing to restore).
create or replace function public.maha_restore_property_cloud(
  target_property uuid,
  target_version bigint,
  restored_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.maha_property_cloud%rowtype;
  old_row public.maha_property_cloud_history%rowtype;
  saved public.maha_property_cloud%rowtype;
begin
  select * into cur from public.maha_property_cloud where property_id = target_property for update;
  if not found then
    raise exception 'no-cloud-record' using errcode = 'P0002';
  end if;
  select * into old_row from public.maha_property_cloud_history
  where property_id = target_property and version = target_version;
  if not found then
    raise exception 'version-not-in-history' using errcode = 'P0002';
  end if;

  update public.maha_property_cloud
  set payload = old_row.payload,
      version = cur.version + 1,
      updated_at = now(),
      updated_by = restored_by
  where property_id = target_property
  returning * into saved;

  return jsonb_build_object('ok', true, 'restored_from', target_version, 'version', saved.version);
end;
$$;

revoke all on function public.maha_restore_property_cloud(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.maha_restore_property_cloud(uuid, bigint, uuid) to service_role;

commit;