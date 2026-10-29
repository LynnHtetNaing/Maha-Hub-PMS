-- User logs: read lines by the REAL moment (not by business date).
--
-- The first reader (maha_user_logs_pull) filters by business date, which only moves when a hotel runs Close Day,
-- so "29 Oct" in the real calendar can be business date 19 Oct. This second reader takes two exact moments
-- (from_at included, to_at excluded). The app turns the days the person picked into moments in the zone they chose
-- (their own computer's zone or the hotel's zone), so a UK owner and a Thai front desk see the same lines for the same
-- real period, whatever date each calendar shows.
--
-- Same rules as maha_user_logs_pull: staff with access to the property and the platform provider can read; nobody else.
-- Newest first; the total is returned for the page numbers. Nothing here changes or deletes any line.

create index if not exists maha_user_logs_at_idx on public.maha_user_logs(property_id, at desc);

create or replace function public.maha_user_logs_pull_at(
  target_property uuid,
  from_at timestamptz,
  to_at timestamptz,
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
  if from_at is null or to_at is null or to_at <= from_at then
    raise exception 'bad-range' using errcode = '22023';
  end if;
  select count(*) into v_total
  from public.maha_user_logs g
  where g.property_id = target_property
    and g.at >= from_at and g.at < to_at
    and (p_title is null or p_title = '' or g.title = p_title)
    and (p_user is null or p_user = '' or g.user_name = p_user);
  select coalesce(jsonb_agg(r order by r.at desc, r.id desc), '[]'::jsonb) into v_rows
  from (
    select g.id, g.at, g.bd, g.user_name as "user", g.shift, g.title as t, g.action as a, g.ref
    from public.maha_user_logs g
    where g.property_id = target_property
      and g.at >= from_at and g.at < to_at
      and (p_title is null or p_title = '' or g.title = p_title)
      and (p_user is null or p_user = '' or g.user_name = p_user)
    order by g.at desc, g.id desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  ) r;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.maha_user_logs_pull_at(uuid, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function public.maha_user_logs_pull_at(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
