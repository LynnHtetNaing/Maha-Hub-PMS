-- Maha Sales (Provider): our own company sales records (hotel prospects, activities, quotes, MSAs, playbook cards).
--
-- Only a platform admin (a provider account) can read or write them. A hotel's people and anonymous visitors can never see them.
-- One row per record: id + kind (hotel, act, quote, msa, card, coll, meta ...) + the record itself as JSON, exactly as the Sales page keeps it today.
-- Nothing is deleted for real: a removed record is marked deleted, so a second device can learn about it and the history stays.
-- NOT APPLIED YET. Run it on the staging project first, then on the main project, only after the owner says yes.

begin;

create table if not exists public.maha_sales_records (
  id text primary key check (length(id) between 1 and 80),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,23}$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 262144),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists maha_sales_records_updated_idx on public.maha_sales_records(updated_at);
create index if not exists maha_sales_records_kind_idx on public.maha_sales_records(kind) where not deleted;

create or replace function public.maha_sales_records_touch() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;

drop trigger if exists maha_sales_records_touch on public.maha_sales_records;
create trigger maha_sales_records_touch before insert or update on public.maha_sales_records
for each row execute function public.maha_sales_records_touch();

alter table public.maha_sales_records enable row level security;
revoke all on public.maha_sales_records from public, anon, authenticated;
grant select, insert, update on public.maha_sales_records to authenticated;

drop policy if exists maha_sales_records_select on public.maha_sales_records;
create policy maha_sales_records_select on public.maha_sales_records for select to authenticated
using (public.maha_is_platform_admin());

drop policy if exists maha_sales_records_insert on public.maha_sales_records;
create policy maha_sales_records_insert on public.maha_sales_records for insert to authenticated
with check (public.maha_is_platform_admin());

drop policy if exists maha_sales_records_update on public.maha_sales_records;
create policy maha_sales_records_update on public.maha_sales_records for update to authenticated
using (public.maha_is_platform_admin()) with check (public.maha_is_platform_admin());

commit;
