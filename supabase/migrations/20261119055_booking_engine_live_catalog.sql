-- Booking Engine: everything built this session (amenities, policies, deposit policy, channels,
-- promotions, theme, Area/Location, B2C/B2B rate scope, room benefits, room photos) already syncs
-- to the cloud - H.set.* syncs per field under maha_records(collection='$set'), roomTypes/rateCodes/
-- rooms/reservations sync per record the same way everything else in the PMS does. What was missing
-- is a way for the Booking Engine server (no PMS session, anon-only) to read any of it: book/server.mjs
-- has only ever read a static local demo file (book/data/catalog.json), never this real data.
--
-- This function assembles exactly the shape book/catalog.js's publicHotelFromHub(h) already expects
-- as its input - so no change is needed there, only in how book/server.mjs gets its hotel object.
-- Guest personal data is never included: reservations are reduced to the handful of booking fields
-- (type/arr/dep/status/room/masterDummy/groupMaster) publicHotelFromHub actually reads for its
-- occupied-rooms calculation, nothing else.

begin;

create or replace function public.maha_be_hotel_public(p_property uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'code', (select property_code from public.maha_properties where id = p_property),
    'set', (
      select coalesce(jsonb_object_agg(r.rec_key, r.data->'v'), '{}'::jsonb)
      from public.maha_records r
      where r.property_id = p_property and r.collection = '$set' and not r.deleted
    ),
    'roomTypes', (
      select coalesce(jsonb_agg(r.data), '[]'::jsonb)
      from public.maha_records r
      where r.property_id = p_property and r.collection = 'roomTypes' and not r.deleted
    ),
    'rateCodes', (
      select coalesce(jsonb_agg(r.data), '[]'::jsonb)
      from public.maha_records r
      where r.property_id = p_property and r.collection = 'rateCodes' and not r.deleted
    ),
    'rooms', (
      select coalesce(jsonb_agg(r.data), '[]'::jsonb)
      from public.maha_records r
      where r.property_id = p_property and r.collection = 'rooms' and not r.deleted
    ),
    'reservations', (
      select coalesce(jsonb_agg(jsonb_build_object('bookings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'type', b->>'type', 'arr', b->>'arr', 'dep', b->>'dep', 'status', b->>'status',
          'room', b->>'room', 'masterDummy', b->'masterDummy', 'groupMaster', b->'groupMaster'
        )), '[]'::jsonb)
        from jsonb_array_elements(coalesce(r.data->'bookings', '[]'::jsonb)) as b
      ))), '[]'::jsonb)
      from public.maha_records r
      where r.property_id = p_property and r.collection = 'reservations' and not r.deleted
    )
  );
$$;
revoke all on function public.maha_be_hotel_public(uuid) from public;
grant execute on function public.maha_be_hotel_public(uuid) to anon, authenticated;

commit;
