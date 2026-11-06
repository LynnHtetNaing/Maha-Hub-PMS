-- Maha Sales (company CRM): the QUOTATION number is given by the database, gapless, counted on each country and month.
--
--   MH-TH2026/11/001      MH = Maha Hub, TH = country of the hotel, 2026/11 = year and month, 001 = running number of that country and month.
--   When a new quotation is saved, the CRM asks the database for its number. The database serves one request after the other (two people saving at the
--   same second are put in a line: the second waits a moment and gets the next number), so a number is never given twice and none is skipped.
--   * The same quotation asking again (a retry, a double click) gets the SAME number: a retry never uses a second one.
--   * A Draft that moves to another country (or month) gives its old number back; the next quotation of that country uses it, so there is no gap.
--   * Quotations that already exist keep their numbers; the counters start after the highest number in use and the free numbers below it are given back.
--   * Only a CRM member or the provider can ask. A browser cannot read or write the counters.
-- It uses the counter table of the Tax Invoice (maha_billing_counters, scopes 'MH-TH2026/11' next to 'TIV-TH2026/11').
-- Needs 20261107_038_tax_invoice_numbers.sql, 20261105_032_sales_records.sql and 20261105_033_crm_team.sql first.
-- NOT APPLIED YET: staging first, then live, only after the owner says yes.

begin;

create table if not exists public.maha_quote_numbers (
  quote_id text primary key check (length(quote_id) between 1 and 80),
  scope text not null check (scope ~ '^MH-[A-Z]{2}[0-9]{4}/[0-9]{2}$'),
  seq integer not null check (seq > 0),
  no text not null unique,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists maha_quote_numbers_scope_idx on public.maha_quote_numbers(scope, seq);
alter table public.maha_quote_numbers enable row level security;
revoke all on public.maha_quote_numbers from public, anon, authenticated;

create table if not exists public.maha_quote_free (
  scope text not null check (scope ~ '^MH-[A-Z]{2}[0-9]{4}/[0-9]{2}$'),
  seq integer not null check (seq > 0),
  primary key (scope, seq)
);
alter table public.maha_quote_free enable row level security;
revoke all on public.maha_quote_free from public, anon, authenticated;

create or replace function public.maha_claim_quote_no(p_quote_id text, p_code text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_scope text;
  v_old record;
  v_seq integer;
  v_no text;
begin
  -- a signed-in person must be a CRM member or the provider; the trusted server / SQL editor (no sign-in) is let through, an anonymous visitor cannot run it at all
  if (select auth.uid()) is not null and not (public.maha_is_crm_member() or public.maha_is_platform_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_quote_id is null or length(btrim(p_quote_id)) not between 1 and 80 then raise exception 'quotation id needed' using errcode = '22023'; end if;
  if v_code !~ '^[A-Z]{2}$' then raise exception 'country code needed' using errcode = '22023'; end if;
  if p_date is null then raise exception 'quotation date needed' using errcode = '22023'; end if;
  v_scope := 'MH-' || v_code || to_char(p_date, 'YYYY') || '/' || to_char(p_date, 'MM');

  -- one request at a time for each country and month: the next one waits here until this one has finished
  perform pg_advisory_xact_lock(hashtext('maha_quote_no:' || v_scope));

  select * into v_old from public.maha_quote_numbers q where q.quote_id = p_quote_id for update;
  if found then
    if v_old.scope = v_scope then return v_old.no; end if;          -- the same quotation again: the same number
    insert into public.maha_quote_free (scope, seq) values (v_old.scope, v_old.seq) on conflict do nothing;   -- moved: the old number is free again
    delete from public.maha_quote_numbers q where q.quote_id = p_quote_id;
  end if;

  delete from public.maha_quote_free f
  where f.scope = v_scope and f.seq = (select min(x.seq) from public.maha_quote_free x where x.scope = v_scope)
  returning f.seq into v_seq;                                      -- the smallest free number first

  if v_seq is null then
    insert into public.maha_billing_counters as c (scope, last_no) values (v_scope, 1)
    on conflict (scope) do update set last_no = c.last_no + 1, updated_at = now()
    returning c.last_no into v_seq;
  end if;

  v_no := v_scope || '/' || lpad(v_seq::text, 3, '0');
  insert into public.maha_quote_numbers (quote_id, scope, seq, no, claimed_by) values (p_quote_id, v_scope, v_seq, v_no, (select auth.uid()));
  return v_no;
end $$;
revoke all on function public.maha_claim_quote_no(text, text, date) from public, anon;
grant execute on function public.maha_claim_quote_no(text, text, date) to authenticated;   -- the function itself checks CRM member / provider

-- The quotations that exist now keep their numbers: the counters start after the highest one, and the numbers below it that nobody uses are free.
do $$
declare
  s record;
  v_dup integer;
begin
  create temporary table _q on commit drop as
    select r.id as quote_id,
           'MH-' || (x.m)[1] || (x.m)[2] || '/' || (x.m)[3] as scope,
           (x.m)[4]::integer as seq,
           r.data->>'no' as no
    from public.maha_sales_records r,
         lateral (select regexp_match(r.data->>'no', '^MH-([A-Z]{2})([0-9]{4})/([0-9]{2})/([0-9]+)$') as m) x
    where r.kind = 'quote' and x.m is not null and (x.m)[4]::integer > 0;

  insert into public.maha_quote_numbers (quote_id, scope, seq, no)
  select distinct on (no) quote_id, scope, seq, no from _q order by no, quote_id
  on conflict do nothing;

  select count(*) into v_dup from (select no from _q group by no having count(*) > 1) d;
  if v_dup > 0 then raise notice '% quotation number(s) were already used twice: the first keeps it, check the others', v_dup; end if;

  insert into public.maha_billing_counters as c (scope, last_no)
  select scope, max(seq) from _q group by scope
  on conflict (scope) do update set last_no = greatest(c.last_no, excluded.last_no);

  for s in select scope, max(seq) as top from _q group by scope loop
    insert into public.maha_quote_free (scope, seq)
    select s.scope, g from generate_series(1, s.top) g
    where not exists (select 1 from _q where _q.scope = s.scope and _q.seq = g)
    on conflict do nothing;
  end loop;
end $$;

commit;
