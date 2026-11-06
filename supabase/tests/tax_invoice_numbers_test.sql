-- Maha Hub: the Tax Invoice number is given by the database, gapless, and restarts every month.
--
--   TIV-TH2026/11/001      TIV = Tax Invoice, TH = country of the hotel, 2026 = year, 11 = month, 001 = running number of that country and month.
--   Each country counts on its own (TIV-VN2026/11/001 is the first Vietnam invoice of the month). The next Thai invoice is 002 ... and December starts again at 001. The number is given in the same transaction that saves the invoice:
--   if the save fails nothing is used, so there is never a missing number. For the same reason a tax invoice can never be deleted
--   (mark it Void instead) and its number and date can never be changed.
--
-- Why it lives here for now: the Provider console is the central place that controls every hotel software and the company's own software.
-- The Finance software will own the invoices later; it keeps using this same counter table (maha_billing_counters) and function
-- (maha_next_tax_invoice_no), so the numbers stay one unbroken line and the hotels map over without a renumber.
--
-- Other records (quote, payment, subscription) keep their typed number. Invoices already saved keep the number they have.
-- Needs 20261103_030_billing_records.sql first. NOT APPLIED YET: staging first, then live, only after the owner says yes.

begin;

create table if not exists public.maha_billing_counters (
  scope text primary key check (length(scope) between 6 and 40),     -- e.g. TIV-TH2026/11
  last_no integer not null default 0 check (last_no >= 0),
  updated_at timestamptz not null default now()
);
alter table public.maha_billing_counters enable row level security;
revoke all on public.maha_billing_counters from public, anon, authenticated;   -- only the functions below (and the Finance software later) touch it

create or replace function public.maha_country_code(p_country text) returns text
language sql immutable set search_path = '' as $$
  select case lower(btrim(coalesce(p_country, '')))
    when '' then 'TH'
    when 'thailand' then 'TH' when 'vietnam' then 'VN' when 'viet nam' then 'VN' when 'cambodia' then 'KH' when 'myanmar' then 'MM'
    when 'lao' then 'LA' when 'laos' then 'LA' when 'malaysia' then 'MY' when 'indonesia' then 'ID' when 'philippines' then 'PH'
    when 'singapore' then 'SG' when 'india' then 'IN' when 'japan' then 'JP' when 'china' then 'CN' when 'south korea' then 'KR'
    when 'korea' then 'KR' when 'hong kong' then 'HK' when 'taiwan' then 'TW' when 'sri lanka' then 'LK' when 'nepal' then 'NP'
    when 'bangladesh' then 'BD' when 'maldives' then 'MV' when 'australia' then 'AU' when 'new zealand' then 'NZ'
    when 'united arab emirates' then 'AE' when 'uae' then 'AE' when 'united kingdom' then 'GB' when 'uk' then 'GB'
    when 'united states' then 'US' when 'usa' then 'US'
    else case when btrim(p_country) ~ '^[A-Za-z]{2}$' then upper(btrim(p_country)) else null end
  end
$$;

-- The next number. The row of the counter is locked until the transaction ends, so two invoices can never get the same number.
create or replace function public.maha_next_tax_invoice_no(p_country text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cc text := public.maha_country_code(p_country);
  v_scope text;
  v_n integer;
begin
  if v_cc is null then raise exception 'unknown country for the tax invoice number: set the hotel country first' using errcode = '22023'; end if;
  if p_date is null then raise exception 'invoice date needed' using errcode = '22023'; end if;
  v_scope := 'TIV-' || v_cc || to_char(p_date, 'YYYY') || '/' || to_char(p_date, 'MM');   -- one counter for each country and month
  insert into public.maha_billing_counters as c (scope, last_no) values (v_scope, 1)
  on conflict (scope) do update set last_no = c.last_no + 1, updated_at = now()
  returning c.last_no into v_n;
  return v_scope || '/' || lpad(v_n::text, 3, '0');
end $$;
revoke all on function public.maha_next_tax_invoice_no(text, date) from public, anon, authenticated;
revoke all on function public.maha_country_code(text) from public, anon, authenticated;

create or replace function public.maha_billing_docs_tiv() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_country text;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'invoice' then
      select p.country into v_country from public.maha_properties p where p.id = new.property_id;
      new.no := public.maha_next_tax_invoice_no(v_country, new.doc_date);   -- whatever number was typed is replaced
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.kind = 'invoice' and (new.no is distinct from old.no or new.doc_date is distinct from old.doc_date
       or new.kind is distinct from old.kind or new.property_id is distinct from old.property_id) then
      raise exception 'a tax invoice number and date cannot be changed: mark it Void and issue a new one' using errcode = '42501';
    end if;
    return new;
  else
    -- a hotel that is removed takes its records with it; a single tax invoice is never deleted
    if old.kind = 'invoice' and exists (select 1 from public.maha_properties p where p.id = old.property_id) then
      raise exception 'a tax invoice cannot be deleted: mark it Void' using errcode = '42501';
    end if;
    return old;
  end if;
end $$;
revoke all on function public.maha_billing_docs_tiv() from public, anon, authenticated;

drop trigger if exists maha_billing_docs_tiv_ins on public.maha_billing_docs;
create trigger maha_billing_docs_tiv_ins before insert on public.maha_billing_docs
for each row execute function public.maha_billing_docs_tiv();
drop trigger if exists maha_billing_docs_tiv_upd on public.maha_billing_docs;
create trigger maha_billing_docs_tiv_upd before update on public.maha_billing_docs
for each row execute function public.maha_billing_docs_tiv();
drop trigger if exists maha_billing_docs_tiv_del on public.maha_billing_docs;
create trigger maha_billing_docs_tiv_del before delete on public.maha_billing_docs
for each row execute function public.maha_billing_docs_tiv();

commit;
