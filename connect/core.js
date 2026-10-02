/**
 * Maha Connect — foundation domain helpers (Phase 1).
 * No live OTA calls. No secrets in this module.
 */

export const CONNECT_VERSION = 'MC_20261002A';

export const CHANNEL_CAPABILITIES = {
  supportsRateUpdate: false,
  supportsInventoryUpdate: false,
  supportsRestrictionUpdate: false,
  supportsReservationPull: false,
  supportsReservationPush: false,
  supportsCancellation: false,
  supportsModification: false,
  supportsPromotion: false,
  supportsVirtualCard: false,
  supportsMapping: false
};

/** Built-in registry entries. Channels are data, not hard-wired UI lists. */
export function defaultChannels() {
  return [
    {
      id: 'ch_mock',
      code: 'MOCK',
      name: 'Maha Mock Channel',
      type: 'Other',
      status: 'available',
      connectionMethod: 'mock',
      apiVersion: '1',
      authenticationMethod: 'none',
      capabilities: {
        ...CHANNEL_CAPABILITIES,
        supportsRateUpdate: true,
        supportsInventoryUpdate: true,
        supportsRestrictionUpdate: true,
        supportsReservationPull: true,
        supportsReservationPush: true,
        supportsCancellation: true,
        supportsModification: true,
        supportsMapping: true
      },
      note: 'Local QA adapter. Not a real OTA.'
    },
    {
      id: 'ch_middle',
      code: 'MIDDLE',
      name: 'Middle connectivity provider',
      type: 'Other',
      status: 'placeholder',
      connectionMethod: 'api',
      apiVersion: 'tbd',
      authenticationMethod: 'api_key',
      capabilities: {
        ...CHANNEL_CAPABILITIES,
        supportsRateUpdate: true,
        supportsInventoryUpdate: true,
        supportsRestrictionUpdate: true,
        supportsReservationPull: true,
        supportsCancellation: true,
        supportsModification: true,
        supportsMapping: true
      },
      note: 'Placeholder for a certified hub. Choose using docs/maha-connect/PROVIDER-CRITERIA.md. Not connected.'
    },
    {
      id: 'ch_direct',
      code: 'DIRECT',
      name: 'Maha Booking (Direct)',
      type: 'Direct',
      status: 'available',
      connectionMethod: 'internal',
      apiVersion: '1',
      authenticationMethod: 'internal',
      capabilities: {
        ...CHANNEL_CAPABILITIES,
        supportsRateUpdate: true,
        supportsInventoryUpdate: true,
        supportsReservationPush: true,
        supportsCancellation: true,
        supportsModification: true,
        supportsMapping: true
      },
      note: 'Maha Booking Engine as a Direct channel. Not an OTA.'
    }
  ];
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isoDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function datesBetween(from, to) {
  const out = [];
  let d = from;
  while (d < to) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/**
 * Sellable = total - sold - blocked - ooo (never negative unless overbook allowed).
 */
export function computeSellable({ total = 0, sold = 0, blocked = 0, ooo = 0, allowOverbook = false } = {}) {
  const raw = Number(total) - Number(sold) - Number(blocked) - Number(ooo);
  if (allowOverbook) return raw;
  return Math.max(0, raw);
}

export function buildInventoryDay(roomType, stayDate, patch = {}) {
  const total = patch.total != null ? Number(patch.total) : Number(roomType.totalRooms || 0);
  const sold = Number(patch.sold || 0);
  const blocked = Number(patch.blocked || 0);
  const ooo = Number(patch.ooo || 0);
  const allowOverbook = !!patch.allowOverbook;
  const sellable = computeSellable({ total, sold, blocked, ooo, allowOverbook });
  return {
    roomTypeId: roomType.id,
    roomTypeCode: roomType.code,
    stayDate,
    total,
    sold,
    blocked,
    ooo,
    sellable,
    stopSell: !!patch.stopSell,
    minStay: patch.minStay == null ? null : Number(patch.minStay),
    maxStay: patch.maxStay == null ? null : Number(patch.maxStay),
    cta: !!patch.cta,
    ctd: !!patch.ctd,
    allowOverbook
  };
}

export function seedInventory(roomTypes, from, days = 14) {
  const end = addDays(from, days);
  const rows = [];
  for (const rt of roomTypes) {
    for (const day of datesBetween(from, end)) {
      rows.push(buildInventoryDay(rt, day));
    }
  }
  return rows;
}

export function propertyFromHubSnapshot(hub, orgId = 'org_padauk') {
  const s = hub.set || {};
  const propertyId = `prop_${hub.code || uid('p')}`;
  const roomTypes = (hub.roomTypes || [])
    .filter(t => !t.dummy)
    .map(t => {
      const rooms = (hub.rooms || []).filter(r => !r.dummy && r.type === t.code);
      return {
        id: `rt_${hub.code}_${t.code}`,
        propertyId,
        code: t.code,
        name: t.name || t.code,
        totalRooms: rooms.length,
        maxOccupancy: t.max == null ? null : Number(t.max),
        baseRate: Number(t.base || 0),
        active: true
      };
    });
  const ratePlans = (hub.rateCodes || []).map(r => ({
    id: `rp_${hub.code}_${r.code}`,
    propertyId,
    code: r.code,
    name: r.desc || r.code,
    currency: s.cur || 'THB',
    mealPlan: r.meal || '',
    kind: r.kind || 'base',
    active: true
  }));
  const today = isoDate(new Date());
  return {
    org: { id: orgId, name: 'Padauk Hospitality', status: 'active' },
    property: {
      id: propertyId,
      orgId,
      hubCode: hub.code,
      name: s.name || hub.code,
      timezone: s.tz || 'Asia/Bangkok',
      currency: s.cur || 'THB',
      countryCode: (s.countryCode || '').slice(0, 2) || null,
      status: 'active',
      updatedAt: new Date().toISOString()
    },
    roomTypes,
    ratePlans,
    inventory: seedInventory(roomTypes, today, 14),
    connections: []
  };
}

export function readiness(store) {
  const props = store.properties || [];
  const channels = store.channels || [];
  const middle = channels.find(c => c.code === 'MIDDLE');
  return {
    version: CONNECT_VERSION,
    liveOta: false,
    certified: false,
    middleProviderConnected: false,
    properties: props.length,
    roomTypes: (store.roomTypes || []).length,
    ratePlans: (store.ratePlans || []).length,
    inventoryDays: (store.inventory || []).length,
    channelsRegistered: channels.length,
    mockAvailable: !!channels.find(c => c.code === 'MOCK'),
    middleProviderStatus: middle ? middle.status : 'missing',
    notes: [
      'Foundation only — not live on OTAs.',
      'Select a certified middle provider using docs/maha-connect/PROVIDER-CRITERIA.md.',
      'Direct OTA certification is optional later.'
    ]
  };
}
