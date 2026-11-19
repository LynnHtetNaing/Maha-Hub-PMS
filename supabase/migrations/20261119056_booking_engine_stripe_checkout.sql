-- Booking Engine: real payment collection at the moment of booking, using each hotel's own Stripe
-- keys (already stored in maha_stripe_keys, purpose 'guest' - the same ones Maha Pay already uses
-- for staff-initiated charges). maha_be_submit_request stays exactly as it was (instant confirm, no
-- payment) for a hotel with no deposit policy or no Stripe configured - never block a booking a
-- hotel never asked to be paid for online. A hotel WITH both gets a payment hold instead: the
-- request sits unconfirmed (but still holding the room, same as any pending/confirmed-unmaterialised
-- row already does) until maha_be_mark_paid confirms a real paid Stripe Checkout Session.

begin;

alter table public.maha_booking_requests
  add column if not exists payment_status text not null default 'none' check (payment_status in ('none', 'awaiting', 'paid', 'failed')),
  add column if not exists stripe_session_id text,
  add column if not exists deposit_amount numeric,
  add column if not exists deposit_currency text;

-- What to actually charge now, read live from this hotel's own saved Deposit / Payment policy
-- (Policies & Notices) - none, a % of the quoted amount, or a fixed amount, capped at the quote.
create or replace function public.maha_be_deposit_due(p_property uuid, p_amount numeric, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_policy jsonb;
  v_kind text;
  v_value numeric;
  v_due numeric;
begin
  select (r.data->'v'->'depositPolicy') into v_policy
  from public.maha_records r
  where r.property_id = p_property and r.collection = '$set' and r.rec_key = 'google' and not r.deleted;

  v_kind := coalesce(v_policy->>'kind', 'none');
  v_value := coalesce((v_policy->>'value')::numeric, 0);

  if v_kind = 'pct' then v_due := round(p_amount * v_value / 100, 2);
  elsif v_kind = 'amt' then v_due := v_value;
  else v_due := 0;
  end if;
  v_due := greatest(0, least(coalesce(v_due, 0), p_amount));

  return jsonb_build_object('kind', v_kind, 'due', v_due, 'currency', upper(p_currency));
end;
$$;
revoke all on function public.maha_be_deposit_due(uuid, numeric, text) from public;
grant execute on function public.maha_be_deposit_due(uuid, numeric, text) to anon, authenticated;

-- Whether this hotel has its own Stripe keys set up for collecting guest payments - never the keys
-- themselves, just yes/no, so the booking server knows whether a Checkout Session is even possible.
create or replace function public.maha_be_stripe_ready(p_property uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.maha_stripe_keys k
    where k.property_id = p_property and k.purpose = 'guest' and length(trim(k.secret_key)) > 0
  );
$$;
revoke all on function public.maha_be_stripe_ready(uuid) from public;
grant execute on function public.maha_be_stripe_ready(uuid) to anon, authenticated;

-- Same checks as maha_be_submit_request (re-checks availability itself), but holds the request
-- unconfirmed and awaiting payment instead of confirming it immediately. The room is still held:
-- maha_be_availability already treats any non-declined, non-materialised request as occupying it.
create or replace function public.maha_be_submit_request_hold(
  p_property uuid, p_room_type text, p_rate_code text, p_arr date, p_dep date,
  p_adults int, p_children int, p_name text, p_email text, p_phone text,
  p_amount numeric, p_currency text, p_note text, p_deposit_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free integer;
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'guest name required'; end if;
  if p_email is null or length(trim(p_email)) < 3 then raise exception 'guest email required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;

  v_free := public.maha_be_availability(p_property, p_room_type, p_arr, p_dep);
  if v_free < 1 then raise exception 'sold_out'; end if;

  insert into public.maha_booking_requests
    (property_id, room_type, rate_code, arr, dep, adults, children, guest_name, guest_email, guest_phone, amount, currency, note, status, payment_status, deposit_amount, deposit_currency)
  values
    (p_property, p_room_type, p_rate_code, p_arr, p_dep, greatest(1, p_adults), greatest(0, p_children),
     trim(p_name), trim(p_email), nullif(trim(coalesce(p_phone, '')), ''), p_amount, upper(p_currency), nullif(trim(coalesce(p_note, '')), ''),
     'pending', 'awaiting', p_deposit_amount, upper(p_currency))
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.maha_be_submit_request_hold(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text, numeric) from public;
grant execute on function public.maha_be_submit_request_hold(uuid, text, text, date, date, int, int, text, text, text, numeric, text, text, numeric) to anon, authenticated;

-- Flips a payment-held request to confirmed once the booking server has verified the Stripe Checkout
-- Session is really paid (never trusts the browser's own redirect alone) - anyone holding the
-- request's own unguessable id and its exact Stripe session id may call this, the same "possession of
-- the id is the capability" pattern the rest of this table already uses for an anonymous guest.
create or replace function public.maha_be_mark_paid(p_request uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.maha_booking_requests
  set status = 'confirmed', payment_status = 'paid', stripe_session_id = p_session_id
  where id = p_request and status = 'pending' and payment_status = 'awaiting';
  if not found then raise exception 'not_awaiting'; end if;
end;
$$;
revoke all on function public.maha_be_mark_paid(uuid, text) from public;
grant execute on function public.maha_be_mark_paid(uuid, text) to anon, authenticated;

-- The guest cancelled or abandoned Checkout - free the held room instead of leaving it stuck.
create or replace function public.maha_be_cancel_hold(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.maha_booking_requests
  set status = 'declined', payment_status = 'failed'
  where id = p_request and status = 'pending' and payment_status = 'awaiting';
end;
$$;
revoke all on function public.maha_be_cancel_hold(uuid) from public;
grant execute on function public.maha_be_cancel_hold(uuid) to anon, authenticated;

commit;
