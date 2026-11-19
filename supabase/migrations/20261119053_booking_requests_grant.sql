-- Booking Engine fix: the original migration revoked every privilege on maha_booking_requests
-- (revoke all ... from public, anon, authenticated) and relied on RLS policies alone, but
-- Postgres checks the table-level grant before RLS ever runs - with no grant, every query from
-- the provider console failed with "permission denied for table", never even reaching the policy.

begin;

grant select, update on public.maha_booking_requests to authenticated;

commit;
