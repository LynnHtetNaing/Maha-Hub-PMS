/**
 * Maha Connect — local JSON store (Phase 1).
 * Replace with Postgres/Supabase (supabase/connect-schema.sql) for production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { defaultChannels, uid } from './core.js';

export function createStore(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  function empty() {
    return {
      version: 1,
      organizations: [{ id: 'org_padauk', name: 'Padauk Hospitality', status: 'active' }],
      properties: [],
      roomTypes: [],
      ratePlans: [],
      inventory: [],
      ratesDaily: [],
      channels: defaultChannels(),
      connections: [],
      syncJobs: [],
      updatedAt: null
    };
  }

  function read() {
    if (!fs.existsSync(filePath)) {
      const seed = empty();
      write(seed);
      return seed;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(raw.channels) || !raw.channels.length) raw.channels = defaultChannels();
    // Ensure registry codes exist even if store was created earlier
    const codes = new Set(raw.channels.map(c => c.code));
    for (const ch of defaultChannels()) {
      if (!codes.has(ch.code)) raw.channels.push(ch);
    }
    raw.organizations = raw.organizations || [];
    raw.properties = raw.properties || [];
    raw.roomTypes = raw.roomTypes || [];
    raw.ratePlans = raw.ratePlans || [];
    raw.inventory = raw.inventory || [];
    raw.ratesDaily = raw.ratesDaily || [];
    raw.connections = raw.connections || [];
    raw.syncJobs = raw.syncJobs || [];
    return raw;
  }

  function write(data) {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data;
  }

  function update(mutator) {
    const data = read();
    mutator(data);
    return write(data);
  }

  function upsertPropertyBundle(bundle) {
    return update(data => {
      if (bundle.org && !data.organizations.find(o => o.id === bundle.org.id)) {
        data.organizations.push(bundle.org);
      }
      const pIdx = data.properties.findIndex(p => p.id === bundle.property.id || p.hubCode === bundle.property.hubCode);
      if (pIdx >= 0) data.properties[pIdx] = { ...data.properties[pIdx], ...bundle.property };
      else data.properties.push(bundle.property);

      const propId = bundle.property.id;
      data.roomTypes = data.roomTypes.filter(r => r.propertyId !== propId).concat(bundle.roomTypes || []);
      data.ratePlans = data.ratePlans.filter(r => r.propertyId !== propId).concat(bundle.ratePlans || []);
      // Replace inventory window for this property for seeded days
      const days = new Set((bundle.inventory || []).map(i => i.stayDate));
      data.inventory = data.inventory
        .filter(i => i.propertyId !== propId || !days.has(i.stayDate))
        .concat((bundle.inventory || []).map(i => ({ ...i, propertyId: propId, id: i.id || uid('inv') })));
    });
  }

  return { filePath, read, write, update, upsertPropertyBundle, empty };
}
