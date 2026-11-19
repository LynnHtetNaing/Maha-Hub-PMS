/* Booking Engine Phase 1 (live availability, never oversell) and Phase 2 (a real, staff-confirmed
   request - never an unattended write into live reservations).
     node tests/sync/liveavail-test.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const sql = rd('supabase/migrations/20261119_050_booking_engine_live_availability.sql');
const server = rd('book/server.mjs');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('maha_booking_requests is locked down by default (no public/anon/authenticated grant) - staff only see and decide their own property\'s requests, and only while still pending',
  sql.includes('revoke all on public.maha_booking_requests from public, anon, authenticated;') &&
  sql.includes('using (public.maha_can_access_property(property_id));') &&
  sql.includes("using (public.maha_can_access_property(property_id) and status = 'pending')"));

T('maha_be_availability re-derives real availability from the hotel\'s own live reservations (maha_records, collection reservations/roomTypes) every time - never a stale export, never trusts a figure the caller sends',
  sql.includes('create or replace function public.maha_be_availability(p_property uuid, p_room_type text, p_arr date, p_dep date)') &&
  sql.includes("r.collection = 'roomTypes' and r.rec_key = p_room_type") &&
  sql.includes("r.collection = 'reservations' and not r.deleted") &&
  sql.includes("coalesce(b->>'status', '') not in ('cancelled', 'noshow')") &&
  sql.includes('grant execute on function public.maha_be_availability(uuid, text, date, date) to anon, authenticated;'));

T('maha_be_submit_request re-checks live availability itself before inserting (never trusts a quote the browser already showed minutes earlier), and refuses a sold-out room outright',
  sql.includes('create or replace function public.maha_be_submit_request(') &&
  sql.includes('v_free := public.maha_be_availability(p_property, p_room_type, p_arr, p_dep);') &&
  sql.includes("if v_free < 1 then raise exception 'sold_out'; end if;"));

T('maha_be_decide_request is the only way a pending request changes status - blocked once no longer pending, and Confirm must carry the real reservation number the PMS just created',
  sql.includes('create or replace function public.maha_be_decide_request(p_request uuid, p_confirm boolean, p_reservation_no text)') &&
  sql.includes("where id = p_request and status = 'pending';") &&
  sql.includes("if p_confirm and (p_reservation_no is null or length(trim(p_reservation_no)) = 0) then raise exception 'reservation_no required'; end if;") &&
  sql.includes('grant execute on function public.maha_be_decide_request(uuid, boolean, text) to authenticated;') &&
  !sql.includes('grant execute on function public.maha_be_decide_request(uuid, boolean, text) to anon'));

T('the Booking Engine server resolves a hotel code to its real cloud property id and clamps every search result\'s shown availability to the live figure - a stale catalog export can never show a sold-out room as bookable, and a connectivity hiccup falls back to the catalog\'s own number instead of failing the whole search',
  server.includes('async function propertyIdFor(code)') &&
  server.includes("async function clampLive(propId, result, checkin, checkout) {\n  if (!propId || !result.available) return result;") &&
  server.includes("const n = Number(live);\n    if (Number.isFinite(n) && n < result.inventory) { result.inventory = Math.max(0, n); result.available = n > 0; }") &&
  server.includes('await Promise.all(results.map(r => clampLive(propId, r, checkin, checkout)));'));

T('a booking request calls maha_be_submit_request (which re-checks live availability itself) before accepting it - sold-out-just-now is reported back as a fresh 409, not silently queued',
  server.includes("cloudId = await sbRpc('maha_be_submit_request', {") &&
  server.includes("if (cloudErr === 'sold_out') { send(res, 409, JSON.stringify({ message: 'That room sold out just now. Please search again.' })); return; }"));

T('the publishable key embedded in book/server.mjs is the same public-by-design one the PMS client itself uses - never a service-role key in a server that has no staff sign-in',
  server.includes("const SB_ANON = process.env.MAHA_SUPABASE_ANON_KEY || 'sb_publishable_ZBa3rioiS97esdCkJZjuYA_wVArOAnD';") &&
  !/SERVICE_ROLE|service_role/.test(server));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
