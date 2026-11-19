/**
 * Maha Booking Engine - the public /api/* handlers, served from the same Worker that already
 * serves book/index.html on BOOK_HOST (booking.maha-hub.com). This is the production equivalent of
 * book/server.mjs's API routes: that Node server reads a static local demo catalog and is only ever
 * run locally for testing; this Worker reads every hotel's real, live data from the cloud (the same
 * maha_be_* RPCs and Edge Functions the rest of the Booking Engine already uses), so a real guest
 * gets real rooms, rates and policies - never demo data.
 *
 * catalog.js has no Node-specific imports (no fs/path), so it is reused here unchanged.
 */
import {
  searchHotel,
  quoteStay,
  readiness,
  isoDate,
  addDays,
  publicHotelFromHub,
} from '../../../book/catalog.js';

async function sbRpc(env, fn, args) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_ANON_KEY || '';
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((d && (d.message || d.hint)) || `rpc ${fn} failed`); e.status = r.status; e.body = d; throw e; }
  return d;
}
async function sbFunc(env, name, args) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_ANON_KEY || '';
  const r = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((d && d.error) || `${name} failed`); e.status = r.status; e.body = d; throw e; }
  return d;
}
const _propIdCache = new Map();
async function propertyIdFor(env, code) {
  if (_propIdCache.has(code)) return _propIdCache.get(code);
  try {
    const id = await sbRpc(env, 'maha_property_id_for_code', { p_code: code });
    _propIdCache.set(code, id || null);
    return id || null;
  } catch { return null; }
}
// The real hotel, live from the cloud - everything built in the PMS admin syncs there automatically.
async function resolveHotel(env, code) {
  const propId = await propertyIdFor(env, code);
  if (!propId) return { hotel: null, propId: null };
  try {
    const liveH = await sbRpc(env, 'maha_be_hotel_public', { p_property: propId });
    if (liveH && liveH.set) {
      const hotel = publicHotelFromHub({ code, set: liveH.set, roomTypes: liveH.roomTypes, rateCodes: liveH.rateCodes, rooms: liveH.rooms, reservations: liveH.reservations });
      return { hotel, propId };
    }
  } catch { /* fall through */ }
  return { hotel: null, propId };
}
async function clampLive(env, propId, result, checkin, checkout) {
  if (!propId || !result.available) return result;
  try {
    const live = await sbRpc(env, 'maha_be_availability', { p_property: propId, p_room_type: result.type, p_arr: checkin, p_dep: checkout });
    const n = Number(live);
    if (Number.isFinite(n) && n < result.inventory) { result.inventory = Math.max(0, n); result.available = n > 0; }
  } catch { /* keep the catalog's own figure */ }
  return result;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});

export async function handleBookingApi(request, env, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-origin': '*' } });
  }

  if (p === '/api/search' && request.method === 'GET') {
    const q = Object.fromEntries(url.searchParams);
    const { hotel, propId } = await resolveHotel(env, q.hotel);
    if (!hotel) return json({ message: 'Hotel not found in the public catalog.' }, 404);
    if (!hotel.bookEnabled || hotel.active === false) return json({ message: 'This hotel is not open for direct booking.' }, 403);
    const checkin = q.checkin || isoDate(new Date());
    const checkout = q.checkout || addDays(checkin, 1);
    if (checkout <= checkin) return json({ message: 'Checkout must be after check-in.' }, 400);
    const results = searchHotel(hotel, { checkin, checkout, adults: q.adults, children: q.children, promoCode: q.promo });
    await Promise.all(results.map(r => clampLive(env, propId, r, checkin, checkout)));
    return json({ googleLive: false, hotel: hotel.id, checkin, checkout, adults: Number(q.adults || 2), children: Number(q.children || 0), currency: hotel.cur, results });
  }

  if (p === '/api/hotel' && request.method === 'GET') {
    const q = Object.fromEntries(url.searchParams);
    const { hotel } = await resolveHotel(env, q.hotel || url.pathname.split('/').pop());
    if (!hotel) return json({ message: 'Hotel not found in the public catalog.' }, 404);
    if (!hotel.bookEnabled || hotel.active === false) return json({ message: 'This hotel is not open for direct booking.' }, 403);
    return json({
      googleLive: false,
      hotel: {
        id: hotel.id, name: hotel.name, addr: hotel.addr, phone: hotel.phone, email: hotel.email, web: hotel.web,
        cur: hotel.cur, svc: hotel.svc, vat: hotel.vat, taxName: hotel.taxName, country: hotel.country, countryCode: hotel.countryCode,
        checkIn: hotel.checkIn, checkOut: hotel.checkOut, lat: hotel.lat, lng: hotel.lng, category: hotel.category, area: hotel.area,
        amenities: hotel.amenities, cancelPolicy: hotel.cancelPolicy, cancelPolicyLines: hotel.cancelPolicyLines,
        importantNotice: hotel.importantNotice, importantNoticeLines: hotel.importantNoticeLines, depositPolicy: hotel.depositPolicy,
        theme: hotel.theme, photoUrl: hotel.photoUrl, logo: hotel.logo, coverPhotos: hotel.coverPhotos, roomTypes: hotel.roomTypes,
        rateCodes: hotel.rateCodes.filter(r => r.kind !== 'zero' && r.comp !== 'COMP' && r.comp !== 'HOUSE'),
        readiness: readiness(hotel),
      },
    });
  }

  if (p === '/api/request' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { hotel } = await resolveHotel(env, body.hotel);
    if (!hotel || !hotel.bookEnabled) return json({ message: 'Hotel not available for booking requests.' }, 404);
    const quote = quoteStay(hotel, { type: body.type, rateCode: body.rateCode, checkin: body.checkin, checkout: body.checkout, adults: Number(body.adults || 2), promoCode: body.promo });
    if (!quote || !quote.available) return json({ message: 'That room or rate is not available for these dates.' }, 409);
    const guest = {
      name: String(body.name || '').trim().slice(0, 120), email: String(body.email || '').trim().slice(0, 160),
      phone: String(body.phone || '').trim().slice(0, 60), country: String(body.country || '').trim().slice(0, 2).toUpperCase(),
    };
    if (!guest.name || !guest.email) return json({ message: 'Name and email are required.' }, 400);
    const gc = hotel.guestCountry || { mode: 'all', list: [] };
    if (gc.mode === 'allow' && guest.country && !gc.list.includes(guest.country)) return json({ message: 'Direct booking is not open to guests from this country. Please contact the hotel directly.' }, 403);
    if (gc.mode === 'block' && guest.country && gc.list.includes(guest.country)) return json({ message: 'Direct booking is not open to guests from this country. Please contact the hotel directly.' }, 403);

    let cloudId = null, checkoutUrl = null;
    const propId = await propertyIdFor(env, hotel.id);
    if (!propId) return json({ message: 'This hotel is not reachable right now. Please try again shortly.' }, 503);
    try {
      let depositDue = { due: 0 }, stripeReady = false;
      try {
        [depositDue, stripeReady] = await Promise.all([
          sbRpc(env, 'maha_be_deposit_due', { p_property: propId, p_amount: quote.amountAfterTax, p_currency: quote.currency }),
          sbRpc(env, 'maha_be_stripe_ready', { p_property: propId }),
        ]);
      } catch { /* treat as no deposit required */ }
      const dueAmount = Number(depositDue && depositDue.due) || 0;

      if (dueAmount > 0 && stripeReady) {
        cloudId = await sbRpc(env, 'maha_be_submit_request_hold', {
          p_property: propId, p_room_type: body.type, p_rate_code: body.rateCode, p_arr: body.checkin, p_dep: body.checkout,
          p_adults: Number(body.adults || 2), p_children: Number(body.children || 0), p_name: guest.name, p_email: guest.email,
          p_phone: guest.phone || null, p_amount: quote.amountAfterTax, p_currency: quote.currency, p_note: null, p_deposit_amount: dueAmount,
        });
        const origin = url.origin;
        const checkout = await sbFunc(env, 'maha-be-checkout', {
          action: 'create', property_code: hotel.id, request_id: cloudId,
          success_url: `${origin}/book/?hotel=${encodeURIComponent(hotel.id)}&paid_request=${cloudId}`,
          cancel_url: `${origin}/book/?hotel=${encodeURIComponent(hotel.id)}&cancelled_request=${cloudId}`,
        });
        checkoutUrl = checkout.url;
      } else {
        cloudId = await sbRpc(env, 'maha_be_submit_request', {
          p_property: propId, p_room_type: body.type, p_rate_code: body.rateCode, p_arr: body.checkin, p_dep: body.checkout,
          p_adults: Number(body.adults || 2), p_children: Number(body.children || 0), p_name: guest.name, p_email: guest.email,
          p_phone: guest.phone || null, p_amount: quote.amountAfterTax, p_currency: quote.currency, p_note: null,
        });
        sbFunc(env, 'maha-be-mail', { property_code: hotel.id, request_id: cloudId, kind: 'confirmation' }).catch(() => {});
      }
    } catch (e) {
      if (e.message === 'sold_out') return json({ message: 'That room sold out just now. Please search again.' }, 409);
      return json({ message: 'Could not submit your booking right now. Please try again.' }, 502);
    }
    return json({
      ok: true, requestId: cloudId, checkoutUrl, amountAfterTax: quote.amountAfterTax, currency: quote.currency,
      message: checkoutUrl ? 'Redirecting you to pay your deposit securely.' : 'Your booking is confirmed - check your email for the confirmation.',
    });
  }

  if (p === '/api/checkout/verify' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { hotel } = await resolveHotel(env, body.hotel);
    if (!hotel) return json({ message: 'Hotel not found.' }, 404);
    try {
      const out = await sbFunc(env, 'maha-be-checkout', { action: 'verify', property_code: hotel.id, request_id: body.requestId, session_id: body.sessionId });
      if (out.confirmed) sbFunc(env, 'maha-be-mail', { property_code: hotel.id, request_id: body.requestId, kind: 'confirmation' }).catch(() => {});
      return json(out);
    } catch { return json({ message: 'Could not verify payment. Please try again.' }, 502); }
  }

  if (p === '/api/checkout/cancel' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { hotel } = await resolveHotel(env, body.hotel);
    if (!hotel) return json({ message: 'Hotel not found.' }, 404);
    try {
      const propId = await propertyIdFor(env, hotel.id);
      if (propId) await sbRpc(env, 'maha_be_cancel_hold', { p_request: body.requestId });
    } catch { /* best effort - the hold also expires naturally if it's never paid */ }
    return json({ ok: true });
  }

  if (p === '/api/receipt' && request.method === 'GET') {
    const q = Object.fromEntries(url.searchParams);
    try {
      const receipt = await sbRpc(env, 'maha_be_receipt', { p_request: q.requestId });
      if (!receipt) return json({ message: 'Receipt not found.' }, 404);
      return json(receipt);
    } catch { return json({ message: 'Could not load the receipt.' }, 502); }
  }

  return json({ message: 'Not found' }, 404);
}
