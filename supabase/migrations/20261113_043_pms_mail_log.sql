-- Mail the PMS sends for a hotel (a reservation confirmation to a guest through Maha Mail).
--   * maha_pms_mail_log   one row for each mail: which hotel, who sent it, to whom, which reservation, and the result.
--     The hotel's own people can read their hotel's rows; only the trusted server (the pms-send-mail function) writes them.
--     The function also uses it to limit one person to 40 mails an hour.

create table if not exists public.maha_pms_mail_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text not null default '',
  to_email text not null,
  subject text not null default '',
  doc text not null default 'confirmation',
  rsvn text not null default '',
  status text not null check (status in ('sent', 'failed')),
  error text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists maha_pms_mail_log_property_idx on public.maha_pms_mail_log(property_id, created_at desc);
create index if not exists maha_pms_mail_log_sender_idx on public.maha_pms_mail_log(sent_by, created_at desc);
alter table public.maha_pms_mail_log enable row level security;
revoke all on public.maha_pms_mail_log from public, anon, authenticated;
grant select on public.maha_pms_mail_log to authenticated;
drop policy if exists maha_pms_mail_log_select on public.maha_pms_mail_log;
create policy maha_pms_mail_log_select on public.maha_pms_mail_log for select to authenticated
using (public.maha_can_access_property(property_id));
