-- Maha Sales (company CRM): sending email from the CRM (quotation to a hotel, Enewletter).
--
--   * maha_mail_log        every email the CRM sent (who sent it, to whom, what, result). The team can read it; only the trusted server writes it.
--   * maha_mail_optout     hotels that asked not to get the Enewletter again (the unsubscribe link). Only the trusted server reads and writes it.
--   * maha_shared_docs     the quotation / MSA a hotel opens from the email link (crm.maha-hub.com/d/<token>). The token is long and random; the
--                          link stops working after 90 days. Only the trusted server writes it; maha_shared_doc(token) returns one document.
-- NOT APPLIED YET. Run it on the staging project first, then on the main project, only after the owner says yes.
-- Needs 20261105_033_crm_team.sql first.

begin;

create table if not exists public.maha_mail_log (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text not null default '',
  to_email text not null,
  subject text not null default '',
  kind text not null check (kind in ('quote', 'newsletter', 'test')),
  quote_no text not null default '',
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text not null default '',
  provider_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists maha_mail_log_created_idx on public.maha_mail_log(created_at desc);
alter table public.maha_mail_log enable row level security;
revoke all on public.maha_mail_log from public, anon, authenticated;
grant select on public.maha_mail_log to authenticated;
drop policy if exists maha_mail_log_select on public.maha_mail_log;
create policy maha_mail_log_select on public.maha_mail_log for select to authenticated
using (public.maha_is_platform_admin() or public.maha_is_crm_member());

create table if not exists public.maha_mail_optout (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now(),
  source text not null default 'link'
);
alter table public.maha_mail_optout enable row level security;
revoke all on public.maha_mail_optout from public, anon, authenticated;

create table if not exists public.maha_shared_docs (
  token text primary key check (length(token) between 24 and 64),
  title text not null default '',
  quote_no text not null default '',
  html text not null check (length(html) < 6000000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
alter table public.maha_shared_docs enable row level security;
revoke all on public.maha_shared_docs from public, anon, authenticated;

-- one document by its token (the hotel opens the link without signing in)
create or replace function public.maha_shared_doc(p_token text)
returns table (title text, html text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.title, d.html from public.maha_shared_docs d
  where d.token = p_token and d.expires_at > now()
  limit 1;
$$;
revoke all on function public.maha_shared_doc(text) from public;
grant execute on function public.maha_shared_doc(text) to anon, authenticated;

commit;
