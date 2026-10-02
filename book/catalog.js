/**
 * Maha Booking Engine — public catalog helpers.
 * Public data only: no guests, cards, folios, or staff passwords.
 */

export const BOOK_VERSION = 'MBE_20261002A';
export const PARTNER_PLACEHOLDER = 'YOUR_GOOGLE_PARTNER_KEY';

const COUNTRY = {
  Thailand: 'TH', Myanmar: 'MM', Singapore: 'SG', Malaysia: 'MY',
  Vietnam: 'VN', Laos: 'LA', Cambodia: 'KH', Indonesia: 'ID', Philippines: 'PH',
  Japan: 'JP', China: 'CN', 'United States': 'US', 'United Kingdom': 'GB'
};

export function countryCode(name, fallback) {
  if (fallback) return String(fallback).toUpperCase().slice(0, 2);
  return COUNTRY[name] || 'TH';
}

export function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function isoDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function datesBetween(arr, dep) {
  const out = [];
  let d = arr;
  while (d < dep) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function rateFor(hotel, typeCode, rateCode) {
  const t = (hotel.roomTypes || []).find(x => x.code === typeCode);
  const r = (hotel.rateCodes || []).find(x => x.code === rateCode);
  if (!t || t.dummy) return 0;
  if (!r) return r2(t.base);
  if (r.kind === 'zero' || r.comp === 'COMP' || r.comp === 'HOUSE') return 0;
  if (r.kind === 'amt') return r2(t.base + Number(r.v || 0));
  return r2(t.base * (1 + Number(r.v || 0) / 100));
}

export function taxSplit(hotel, amt) {
  const s = Number(hotel.svc || 0) / 100;
  const v = Number(hotel.vat || 0) / 100;
  let net = r2(amt / (1 + s) / (1 + v));
  const svc = r2(net * s);
  const vat = r2((net + svc) * v);
  net = r2(amt - svc - vat);
  return { net, svc, vat, total: r2(amt) };
}

export function inventoryForType(hotel, typeCode, day) {
  const rooms = (hotel.rooms || []).filter(r => !r.dummy && r.type === typeCode);
  let count = 0;
  for (const rm of rooms) {
    if (rm.ooo && day >= rm.ooo.from && day <= rm.ooo.to) continue;
    count += 1;
  }
  const used = (hotel.occupied || []).filter(o =>
    o.type === typeCode && o.arr <= day && day < o.dep && !['cancelled', 'noshow'].includes(o.status)
  ).length;
  return Math.max(0, count - used);
}

export function sellableRates(hotel) {
  return (hotel.rateCodes || []).filter(r =>
    r.kind !== 'zero' && r.comp !== 'COMP' && r.comp !== 'HOUSE' && r.code !== 'HU'
  );
}

export function quoteStay(hotel, { type, rateCode, checkin, checkout, adults }) {
  const nights = datesBetween(checkin, checkout);
  if (!nights.length) return null;
  const rt = (hotel.roomTypes || []).find(t => t.code === type && !t.dummy);
  if (!rt) return null;
  if (adults && rt.max && adults > rt.max) return null;
  const rates = sellableRates(hotel);
  const rc = rates.find(r => r.code === rateCode) || rates[0];
  if (!rc) return null;
  let available = true;
  let minInv = Infinity;
  const nightly = {};
  for (const d of nights) {
    const inv = inventoryForType(hotel, type, d);
    minInv = Math.min(minInv, inv);
    if (inv < 1) available = false;
    nightly[d] = rateFor(hotel, type, rc.code);
  }
  const subtotal = r2(Object.values(nightly).reduce((a, b) => a + b, 0));
  const split = taxSplit(hotel, subtotal);
  return {
    type: rt.code,
    typeName: rt.name,
    rateCode: rc.code,
    rateDesc: rc.desc || rc.code,
    meal: rc.meal || '',
    nights: nights.length,
    nightly,
    currency: hotel.cur,
    amountBeforeTax: split.net + split.svc,
    amountAfterTax: split.total,
    tax: split.vat,
    service: split.svc,
    net: split.net,
    available,
    inventory: Number.isFinite(minInv) ? minInv : 0,
    cancelPolicy: hotel.cancelPolicy || '',
    refundable: !(rc.code || '').includes('NRF')
  };
}

export function searchHotel(hotel, q) {
  const checkin = q.checkin;
  const checkout = q.checkout;
  const adults = Number(q.adults || 2);
  const children = Number(q.children || 0);
  const results = [];
  for (const t of (hotel.roomTypes || []).filter(x => !x.dummy)) {
    for (const r of sellableRates(hotel)) {
      const quote = quoteStay(hotel, {
        type: t.code,
        rateCode: r.code,
        checkin,
        checkout,
        adults: adults + children
      });
      if (quote) results.push(quote);
    }
  }
  return results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.amountAfterTax - b.amountAfterTax;
  });
}

/** Build a public catalog hotel from a Maha Hub hotel object. */
export function publicHotelFromHub(h, opts = {}) {
  const s = h.set || {};
  const g = Object.assign({
    enabled: false,
    lat: '',
    lng: '',
    countryCode: '',
    category: 'hotel',
    amenities: [],
    cancelPolicy: '',
    photoUrl: '',
    brand: 'Maha Booking'
  }, s.google || {});
  const occupied = [];
  (h.reservations || []).forEach(r => {
    (r.bookings || []).forEach(b => {
      if (b.masterDummy || b.groupMaster) return;
      if (b.room && String(b.room).startsWith('D')) return;
      occupied.push({
        type: b.type,
        arr: b.arr,
        dep: b.dep,
        status: b.status
      });
    });
  });
  return {
    id: h.code,
    name: s.name || h.code,
    legal: s.legal || '',
    addr: s.addr || '',
    phone: s.phone || '',
    email: s.email || '',
    web: s.web || '',
    cur: s.cur || 'THB',
    svc: Number(s.svc || 0),
    vat: Number(s.vat || 0),
    taxName: s.taxName || 'Tax',
    country: s.country || '',
    countryCode: countryCode(s.country, g.countryCode),
    checkIn: s.checkIn || '14:00',
    checkOut: s.checkOut || '12:00',
    lat: g.lat === '' || g.lat == null ? null : Number(g.lat),
    lng: g.lng === '' || g.lng == null ? null : Number(g.lng),
    category: g.category || 'hotel',
    amenities: Array.isArray(g.amenities) ? g.amenities.slice() : [],
    cancelPolicy: g.cancelPolicy || '',
    photoUrl: g.photoUrl || '',
    brand: g.brand || 'Maha Booking',
    bookEnabled: !!(g.enabled || opts.forceEnable),
    active: h.active !== false,
    roomTypes: (h.roomTypes || []).filter(t => !t.dummy).map(t => ({
      code: t.code,
      name: t.name,
      base: Number(t.base || 0),
      max: Number(t.max || 2),
      dummy: false
    })),
    rateCodes: (h.rateCodes || []).map(r => ({
      code: r.code,
      desc: r.desc || r.code,
      kind: r.kind || 'pct',
      v: Number(r.v || 0),
      meal: r.meal || '',
      comp: r.comp || ''
    })),
    rooms: (h.rooms || []).filter(r => !r.dummy).map(r => ({
      no: r.no,
      type: r.type,
      ooo: r.ooo ? { from: r.ooo.from, to: r.ooo.to } : null,
      dummy: false
    })),
    occupied,
    publishedAt: new Date().toISOString()
  };
}

export function buildCatalogFromHub(db, opts = {}) {
  const hotels = Object.values(db.hotels || {})
    .map(h => publicHotelFromHub(h, opts))
    .filter(h => opts.onlyEnabled ? h.bookEnabled && h.active : true);
  return {
    version: BOOK_VERSION,
    partnerDisplayName: 'Maha Booking',
    partnerKeyPlaceholder: PARTNER_PLACEHOLDER,
    googleLive: false,
    note: 'Feeds are generated for Hotel Center upload after Google partners Maha. Not live on Google Search or Maps.',
    baseBookUrl: opts.baseBookUrl || '',
    hotels,
    updatedAt: new Date().toISOString()
  };
}

export function readiness(hotel) {
  const checks = [
    { id: 'active', label: 'Hotel is active in Maha Hub', ok: hotel.active !== false },
    { id: 'book', label: 'Direct booking enabled for distribution', ok: !!hotel.bookEnabled },
    { id: 'name', label: 'Hotel name', ok: !!hotel.name },
    { id: 'addr', label: 'Address', ok: !!hotel.addr },
    { id: 'phone', label: 'Phone', ok: !!hotel.phone },
    { id: 'geo', label: 'Latitude and longitude', ok: hotel.lat != null && hotel.lng != null && !Number.isNaN(hotel.lat) && !Number.isNaN(hotel.lng) },
    { id: 'country', label: 'Country code', ok: !!(hotel.countryCode && hotel.countryCode.length === 2) },
    { id: 'rooms', label: 'At least one sellable room type', ok: (hotel.roomTypes || []).some(t => !t.dummy && t.base >= 1) },
    { id: 'rates', label: 'At least one public rate code', ok: sellableRates(hotel).length > 0 },
    { id: 'cancel', label: 'Cancellation policy text', ok: !!(hotel.cancelPolicy && hotel.cancelPolicy.trim()) },
    { id: 'google', label: 'Google Connectivity Partner approval', ok: false, external: true }
  ];
  const codeOk = checks.filter(c => !c.external && c.ok).length;
  const codeTotal = checks.filter(c => !c.external).length;
  return { checks, codeOk, codeTotal, googleApproved: false };
}
