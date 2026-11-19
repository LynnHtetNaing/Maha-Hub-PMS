-- Maha Hub: the emailed sign-in code is asked ONCE PER PERSON (first sign-in, then again after 30 days),
-- on any browser or device. Before this, every new browser or device asked for a code.
-- Only the two functions below change; the tables stay as they are. Old device rows still count as the person's last code.

create or replace function public.maha_device_trusted(p_user uuid, p_device_hash text, p_days integer default 30)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maha_trusted_devices d
    where d.user_id = p_user
      and d.last_verified_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  );
$$;

-- The right code was typed: close the attempt and always remember it for this person for the next 30 days.
create or replace function public.maha_login_challenge_done(p_id uuid, p_remember boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.maha_login_challenges%rowtype;
begin
  select * into c from public.maha_login_challenges where id = p_id for update;
  if not found or c.used then return; end if;
  update public.maha_login_challenges set used = true where id = p_id;
  insert into public.maha_trusted_devices(user_id, device_hash) values (c.user_id, c.device_hash)
  on conflict (user_id, device_hash) do update set last_verified_at = now();
end;
$$;

revoke all on function public.maha_device_trusted(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.maha_login_challenge_done(uuid, boolean) from public, anon, authenticated;
grant execute on function public.maha_device_trusted(uuid, text, integer) to service_role;
grant execute on function public.maha_login_challenge_done(uuid, boolean) to service_role;
