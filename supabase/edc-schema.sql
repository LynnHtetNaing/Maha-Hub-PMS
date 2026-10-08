-- Maha Hub — EDC Card Link (guest collect for key-in)
-- Run in Supabase SQL editor AFTER supabase/schema.sql.
-- Full PAN/CVC for EDC key-in live here (not in maha_cloud hotel payload).
-- Guest open/submit uses the link id as a capability token (no hotel passphrase).

create table if not exists maha_edc (
  id text primary key,
  hotel text not null,
  status text not null,
  meta jsonb not null default '{}'::jsonb,
  card jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists maha_edc_hotel_idx on maha_edc(hotel);

alter table maha_edc enable row level security;
revoke all on table maha_edc from public, anon, authenticated;

create or replace function maha_edc_put(pass text, link jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
declare
  lid text;
  hcode text;
  st text;
begin
  perform maha_check(pass);
  if link is null or jsonb_typeof(link) <> 'object' then
    raise exception 'bad-link';
  end if;
  lid := coalesce(link->>'id','');
  hcode := coalesce(link->>'hotel','');
  st := coalesce(link->>'status','waiting');
  if lid = '' or hcode = '' then
    raise exception 'bad-link';
  end if;
  insert into maha_edc(id, hotel, status, meta, card, updated_at)
  values (
    lid,
    hcode,
    st,
    coalesce(link->'meta', '{}'::jsonb),
    link->'card',
    now()
  )
  on conflict (id) do update set
    hotel = excluded.hotel,
    status = excluded.status,
    meta = excluded.meta,
    card = excluded.card,
    updated_at = now();
  return jsonb_build_object('ok', true, 'id', lid);
end;
$edc$;

create or replace function maha_edc_list(pass text, hotel text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
begin
  perform maha_check(pass);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'hotel', e.hotel,
      'status', e.status,
      'meta', e.meta,
      'card', e.card,
      'updatedAt', e.updated_at
    ) order by e.updated_at desc)
    from maha_edc e
    where e.hotel = hotel
  ), '[]'::jsonb);
end;
$edc$;

create or replace function maha_edc_keyed(pass text, id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
declare
  lid text := id;
begin
  perform maha_check(pass);
  update maha_edc
    set status = 'keyed',
        card = case when card is null then null else (card - 'cvc' - 'cvv') end,
        updated_at = now()
  where maha_edc.id = lid;
  if not found then raise exception 'not-found'; end if;
  return jsonb_build_object('ok', true);
end;
$edc$;

create or replace function maha_edc_wipe(pass text, id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
declare
  lid text := id;
begin
  perform maha_check(pass);
  update maha_edc
    set card = case when card is null then null else jsonb_build_object(
          'brand', card->>'brand',
          'last4', card->>'last4',
          'holder', card->>'holder',
          'exp', card->>'exp'
        ) end,
        updated_at = now()
  where maha_edc.id = lid;
  if not found then raise exception 'not-found'; end if;
  return jsonb_build_object('ok', true);
end;
$edc$;

-- Public guest read (no passphrase). Returns form fields; never returns stored card.
create or replace function maha_edc_public_get(id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
declare
  lid text := id;
  e maha_edc%rowtype;
begin
  select * into e from maha_edc where maha_edc.id = lid;
  if e.id is null then
    return jsonb_build_object('ok', false, 'error', 'not-found');
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', e.id,
    'hotel', e.hotel,
    'status', e.status,
    'meta', e.meta,
    'hasCard', e.card is not null
  );
end;
$edc$;

-- Public guest submit. Only when status is waiting.
create or replace function maha_edc_public_submit(id text, card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $edc$
declare
  lid text := id;
  e maha_edc%rowtype;
  pan text;
  cvc text;
begin
  select * into e from maha_edc where maha_edc.id = lid for update;
  if e.id is null then
    return jsonb_build_object('ok', false, 'error', 'not-found');
  end if;
  if e.status <> 'waiting' then
    return jsonb_build_object('ok', false, 'error', 'not-waiting');
  end if;
  if (e.meta ? 'expiresAt') and (e.meta->>'expiresAt') ~ '^[0-9]+$'
     and (e.meta->>'expiresAt')::bigint > 0
     and (e.meta->>'expiresAt')::bigint < (extract(epoch from now())*1000)::bigint then
    update maha_edc set status = 'expired', updated_at = now() where maha_edc.id = lid;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if card is null or jsonb_typeof(card) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad-card');
  end if;
  pan := regexp_replace(coalesce(card->>'pan',''), '\D', '', 'g');
  cvc := regexp_replace(coalesce(card->>'cvc', card->>'cvv', ''), '\D', '', 'g');
  if length(pan) < 12 or length(cvc) < 3 then
    return jsonb_build_object('ok', false, 'error', 'bad-card');
  end if;
  update maha_edc set
    status = 'submitted',
    card = jsonb_build_object(
      'brand', coalesce(card->>'brand','CARD'),
      'pan', pan,
      'last4', right(pan, 4),
      'exp', coalesce(card->>'exp',''),
      'cvc', cvc,
      'holder', coalesce(card->>'holder','')
    ),
    meta = e.meta || jsonb_build_object('submittedAt', (extract(epoch from now())*1000)::bigint),
    updated_at = now()
  where maha_edc.id = lid;
  return jsonb_build_object('ok', true, 'status', 'submitted', 'last4', right(pan, 4));
end;
$edc$;

grant execute on function maha_edc_put(text, jsonb) to anon, authenticated;
grant execute on function maha_edc_list(text, text) to anon, authenticated;
grant execute on function maha_edc_keyed(text, text) to anon, authenticated;
grant execute on function maha_edc_wipe(text, text) to anon, authenticated;
grant execute on function maha_edc_public_get(text) to anon, authenticated;
grant execute on function maha_edc_public_submit(text, jsonb) to anon, authenticated;
