-- Maha Hub: record-level cloud sync (many devices, many staff, same hotel at once).
-- Additive only: does not touch maha_property_cloud, maha_cloud or maha_secret.
--
-- A hotel is stored as one row per record (reservation, guest, folio, room, ...), each with its
-- own version. Devices push only what changed and pull everything after a per-hotel cursor
-- (seq). Two staff editing DIFFERENT records never conflict; editing the SAME record from a stale
-- version is rejected with the current copy, never silently overwritten. Deletes are tombstones
-- so other devices learn about them. Browser roles have no direct table writes.

begin;

create table if not exists public.maha_property_seq (
  property_id uuid primary key references public.maha_properties(id) on delete cascade,
  last_seq bigint not null default 0
);

create table if not exists public.maha_records (
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  collection text not null check (collection ~ '^[A-Za-z0-9_$.-]{1,60}$'),
  rec_key text not null check (length(rec_key) between 1 and 200),
  data jsonb,
  deleted boolean not null default false,
  version bigint not null default 1 check (version > 0),
  seq bigint not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (property_id, collection, rec_key),
  check (deleted or data is not null)
);
create index if not exists maha_records_seq_idx on public.maha_records(property_id, seq);

create table if not exists public.maha_counters (
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  counter text not null check (counter ~ '^[A-Za-z0-9_]{1,40}$'),
  next_value bigint not null check (next_value > 0),
  primary key (property_id, counter)
);

alter table public.maha_property_seq enable row level security;
alter table public.maha_records enable row level security;
alter table public.maha_counters enable row level security;
revoke all on public.maha_property_seq from public, anon, authenticated;
revoke all on public.maha_records from public, anon, authenticated;
revoke all on public.maha_counters from public, anon, authenticated;
grant select on public.maha_records to authenticated;

drop policy if exists maha_records_select_member on public.maha_records;
create policy maha_records_select_member
on public.maha_records for select to authenticated
using (public.maha_can_access_property(property_id));

-- Push a batch of changes. Each change:
--   {collection, key, base_version, deleted?, data?}
-- base_version is the version the device last saw (0 = new record).
-- Returns {applied:[{collection,key,version,seq}], conflicts:[{collection,key,version,deleted,data}], seq}.
create or replace function public.maha_sync_push(target_property uuid, changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ch jsonb;
  cur public.maha_records%rowtype;
  v_seq bigint;
  applied jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
  coll text;
  k text;
  base bigint;
  del boolean;
  d jsonb;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'property-write-denied' using errcode = '42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 500 then
    raise exception 'invalid-changes' using errcode = '22023';
  end if;

  -- One writer at a time per hotel keeps seq strictly ordered, so pull cursors cannot skip rows.
  insert into public.maha_property_seq(property_id, last_seq)
  values (target_property, 0) on conflict (property_id) do nothing;
  select last_seq into v_seq from public.maha_property_seq
  where property_id = target_property for update;

  for ch in select value from jsonb_array_elements(changes) loop
    coll := ch->>'collection';
    k := ch->>'key';
    base := coalesce((ch->>'base_version')::bigint, 0);
    del := coalesce((ch->>'deleted')::boolean, false);
    d := ch->'data';
    if coll is null or coll !~ '^[A-Za-z0-9_$.-]{1,60}$' or k is null or length(k) not between 1 and 200 then
      raise exception 'invalid-change' using errcode = '22023';
    end if;
    if not del then
      if d is null or jsonb_typeof(d) = 'null' then
        raise exception 'invalid-change' using errcode = '22023';
      end if;
      if public.maha_payload_has_forbidden_keys(d) then
        raise exception 'sensitive-data-rejected' using errcode = '22023';
      end if;
    end if;

    select * into cur from public.maha_records
    where property_id = target_property and collection = coll and rec_key = k
    for update;

    if not found then
      if base <> 0 then
        conflicts := conflicts || jsonb_build_object('collection', coll, 'key', k, 'version', 0, 'deleted', true, 'data', null);
        continue;
      end if;
      v_seq := v_seq + 1;
      insert into public.maha_records(property_id, collection, rec_key, data, deleted, version, seq, updated_by)
      values (target_property, coll, k, case when del then null else d end, del, 1, v_seq, uid);
      applied := applied || jsonb_build_object('collection', coll, 'key', k, 'version', 1, 'seq', v_seq);
    elsif cur.version <> base then
      conflicts := conflicts || jsonb_build_object('collection', coll, 'key', k,
        'version', cur.version, 'deleted', cur.deleted, 'data', cur.data);
    else
      v_seq := v_seq + 1;
      update public.maha_records
      set data = case when del then null else d end,
          deleted = del,
          version = cur.version + 1,
          seq = v_seq,
          updated_at = now(),
          updated_by = uid
      where property_id = target_property and collection = coll and rec_key = k;
      applied := applied || jsonb_build_object('collection', coll, 'key', k, 'version', cur.version + 1, 'seq', v_seq);
    end if;
  end loop;

  update public.maha_property_seq set last_seq = v_seq where property_id = target_property;
  return jsonb_build_object('applied', applied, 'conflicts', conflicts, 'seq', v_seq);
end;
$$;

-- Pull everything changed after cursor `since` (0 = full download), oldest first, in pages.
create or replace function public.maha_sync_pull(target_property uuid, since bigint default 0, page_size integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page integer := least(greatest(coalesce(page_size, 500), 1), 1000);
  recs jsonb;
  max_seq bigint;
  head bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_access_property(target_property) then
    raise exception 'property-access-denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb), max(r.seq)
  into recs, max_seq
  from (
    select rec.collection, rec.rec_key as key, rec.data, rec.deleted, rec.version, rec.seq
    from public.maha_records rec
    where rec.property_id = target_property and rec.seq > coalesce(since, 0)
    order by rec.seq
    limit page
  ) r;

  select coalesce((select last_seq from public.maha_property_seq where property_id = target_property), 0)
  into head;

  return jsonb_build_object(
    'records', recs,
    'seq', coalesce(max_seq, coalesce(since, 0)),
    'head', head,
    'more', coalesce(max_seq, coalesce(since, 0)) < head
  );
end;
$$;

-- Lease a block of sequential numbers (reservation no., invoice no., profile id, ...). Blocks never
-- overlap, so two devices can issue numbers offline without ever issuing the same one.
-- floor_value seeds the counter the first time (e.g. the hotel's current "next" number).
create or replace function public.maha_lease_numbers(
  target_property uuid, counter_name text, floor_value bigint, block_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_value bigint;
  n integer := coalesce(block_size, 0);
begin
  if (select auth.uid()) is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  if not public.maha_can_write_property(target_property) then
    raise exception 'property-write-denied' using errcode = '42501';
  end if;
  if counter_name is null or counter_name !~ '^[A-Za-z0-9_]{1,40}$' or n < 1 or n > 1000 then
    raise exception 'invalid-lease' using errcode = '22023';
  end if;

  insert into public.maha_counters(property_id, counter, next_value)
  values (target_property, counter_name, greatest(coalesce(floor_value, 1), 1))
  on conflict (property_id, counter)
  do update set next_value = greatest(public.maha_counters.next_value, excluded.next_value);

  update public.maha_counters
  set next_value = next_value + n
  where property_id = target_property and counter = counter_name
  returning next_value - n into start_value;

  return jsonb_build_object('start', start_value, 'end', start_value + n - 1);
end;
$$;

revoke all on function public.maha_sync_push(uuid, jsonb) from public, anon;
revoke all on function public.maha_sync_pull(uuid, bigint, integer) from public, anon;
revoke all on function public.maha_lease_numbers(uuid, text, bigint, integer) from public, anon;
grant execute on function public.maha_sync_push(uuid, jsonb) to authenticated;
grant execute on function public.maha_sync_pull(uuid, bigint, integer) to authenticated;
grant execute on function public.maha_lease_numbers(uuid, text, bigint, integer) to authenticated;

commit;
