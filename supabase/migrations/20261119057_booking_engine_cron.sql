-- Booking Engine: a scheduled tick, every 15 minutes, that does two things no guest-driven request
-- can do on its own - reconcile a payment the guest never came back to confirm, and send the
-- lifecycle emails (arrival reminder, post-checkout thank-you, abandoned-booking nudge) the Email
-- Alerts settings already describe but nothing has ever actually fired. The tick itself is a thin
-- HTTP call (pg_cron + pg_net) into the maha-be-cron Edge Function, which does the real work in
-- ordinary async code rather than long-running SQL.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Which (property, reservation, booking, alert type) combinations have already been mailed, so the
-- same arrival reminder or thank-you never goes out twice.
create table if not exists public.maha_be_alert_sent (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  reservation_no text not null,
  booking_id text not null,
  alert_type text not null check (alert_type in ('arrival', 'departure', 'abandonment', 'birthday')),
  sent_at timestamptz not null default now(),
  unique (property_id, reservation_no, booking_id, alert_type)
);
alter table public.maha_be_alert_sent enable row level security;
revoke all on public.maha_be_alert_sent from public, anon, authenticated;
-- Only the maha-be-cron Edge Function (service role) ever touches this table.

select cron.unschedule('maha-be-cron-tick') where exists (select 1 from cron.job where jobname = 'maha-be-cron-tick');
select cron.schedule('maha-be-cron-tick', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://wragaoglvksbbgmfjyzp.supabase.co/functions/v1/maha-be-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_ZBa3rioiS97esdCkJZjuYA_wVArOAnD'),
    body := '{}'::jsonb
  );
$$);

commit;
