-- Your Chain Hotels: the list of every hotel of the chain, for every signed-in person of that chain.
-- Not applied automatically. Run only after the owner has approved it.
begin;

alter table public.maha_properties add column if not exists country text;
alter table public.maha_properties add column if not exists location text;
alter table public.maha_properties add column if not exists phone text;

-- Every hotel of the chain(s) the caller belongs to (owner, or an active membership at any hotel of it).
-- can_open tells whether the caller may open that hotel; the other columns are shown as text only.
create or replace function public.maha_chain_hotels()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'property_id', p.id, 'property_code', p.property_code, 'name', p.name,
      'country', p.country, 'location', p.location, 'phone', p.phone,
      'chain_name', o.name, 'chain_code', o.chain_code,
      'can_open', public.maha_can_access_property(p.id)
    ) order by p.country nulls last, p.property_code)
    from public.maha_properties p
    join public.maha_organizations o on o.id = p.organization_id
    where p.deleted_at is null
      and p.property_code is not null
      and p.organization_id in (
        select o2.id from public.maha_organizations o2 where o2.owner_user_id = uid
        union
        select m.organization_id from public.maha_memberships m where m.user_id = uid and m.active
      )
  ), '[]'::jsonb);
end;
$$;

-- The app of a hotel keeps these three details of its own hotel up to date (country, location, phone).
create or replace function public.maha_set_property_info(p_code text, p_country text, p_location text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '28000';
  end if;
  select p.id into pid from public.maha_properties p
   where upper(p.property_code) = upper(p_code) and p.deleted_at is null;
  if pid is null then
    raise exception 'property_not_found' using errcode = 'P0002';
  end if;
  if not public.maha_can_access_property(pid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.maha_properties
     set country = left(coalesce(p_country, ''), 80),
         location = left(coalesce(p_location, ''), 200),
         phone = left(coalesce(p_phone, ''), 60)
   where id = pid;
end;
$$;

revoke all on function public.maha_chain_hotels() from public, anon;
revoke all on function public.maha_set_property_info(text, text, text, text) from public, anon;
grant execute on function public.maha_chain_hotels() to authenticated;
grant execute on function public.maha_set_property_info(text, text, text, text) to authenticated;

commit;
