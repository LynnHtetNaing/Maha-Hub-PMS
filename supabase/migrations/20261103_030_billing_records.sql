-- Maha Hub: billing records (quotes, invoices, payments, subscriptions) per hotel.
--
-- The provider (platform admin) records them. A hotel's people can only READ their own hotel's records,
-- on the billing page (/billing) that opens in its own tab from any Maha system.
--   * Browsers can never insert, change or delete a record unless they are a platform admin.
--   * A hotel sees only its own hotel (maha_can_access_property), never another hotel's.
-- NOT APPLIED YET. Run it on the staging project first, then on the main project, only after the owner says yes.

begin;

create table if not exists public.maha_billing_docs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice', 'payment', 'subscription')),
  no text not null check (length(trim(no)) between 1 and 40),
  doc_date date not null default current_date,
  due_date date,
  period_from date,
  period_to date,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open', 'paid', 'void', 'active', 'ended', 'accepted', 'declined')),
  paid_for text check (paid_for is null or length(paid_for) <= 40),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (property_id, kind, no)
);
create index if not exists maha_billing_docs_property_idx on public.maha_billing_docs(property_id, kind, doc_date desc);
create index if not exists maha_billing_docs_created_by_idx on public.maha_billing_docs(created_by);

alter table public.maha_billing_docs enable row level security;
revoke all on public.maha_billing_docs from public, anon, authenticated;
grant select, insert, update, delete on public.maha_billing_docs to authenticated;

drop policy if exists maha_billing_docs_select on public.maha_billing_docs;
create policy maha_billing_docs_select on public.maha_billing_docs for select to authenticated
using (public.maha_can_access_property(property_id) or public.maha_is_platform_admin());

drop policy if exists maha_billing_docs_insert on public.maha_billing_docs;
create policy maha_billing_docs_insert on public.maha_billing_docs for insert to authenticated
with check (public.maha_is_platform_admin());

drop policy if exists maha_billing_docs_update on public.maha_billing_docs;
create policy maha_billing_docs_update on public.maha_billing_docs for update to authenticated
using (public.maha_is_platform_admin()) with check (public.maha_is_platform_admin());

drop policy if exists maha_billing_docs_delete on public.maha_billing_docs;
create policy maha_billing_docs_delete on public.maha_billing_docs for delete to authenticated
using (public.maha_is_platform_admin());

commit;
