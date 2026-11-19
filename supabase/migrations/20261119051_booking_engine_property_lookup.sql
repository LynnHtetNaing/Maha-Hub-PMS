-- Booking Engine fix: book/server.mjs had no anon-safe way to turn a property_code into the
-- property's id - it tried a direct `select ... from maha_properties`, which RLS correctly blocks
-- for anon. That silently made every live-availability clamp and cloud booking request a no-op in
-- production. This is the one-way door: code in, id out, nothing else about the property exposed.

begin;

create or replace function public.maha_property_id_for_code(p_code text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from public.maha_properties
  where property_code = p_code and deleted_at is null
  order by created_at asc
  limit 1;
$$;
revoke all on function public.maha_property_id_for_code(text) from public;
grant execute on function public.maha_property_id_for_code(text) to anon, authenticated;

commit;
