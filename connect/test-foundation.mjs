/**
 * Phase 1 foundation checks for Maha Connect (no live OTA).
 */
import assert from 'node:assert/strict';
import {
  computeSellable,
  propertyFromHubSnapshot,
  readiness,
  defaultChannels,
  buildInventoryDay,
  CONNECT_VERSION
} from './core.js';
import { createStore } from './store.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMockAdapter } from './adapters/mock.js';
import { createMiddleProviderAdapter } from './adapters/middle-provider.js';

assert.equal(computeSellable({ total: 10, sold: 3, blocked: 1, ooo: 2 }), 4);
assert.equal(computeSellable({ total: 2, sold: 5, blocked: 0, ooo: 0 }), 0);
assert.equal(computeSellable({ total: 2, sold: 5, blocked: 0, ooo: 0, allowOverbook: true }), -3);

const channels = defaultChannels();
assert.ok(channels.find(c => c.code === 'MOCK'));
assert.ok(channels.find(c => c.code === 'MIDDLE'));
assert.ok(channels.find(c => c.code === 'DIRECT'));

const hub = {
  code: 'DEMO1',
  set: { name: 'Demo Hotel', cur: 'THB', country: 'Thailand' },
  roomTypes: [{ code: 'DLX', name: 'Deluxe', base: 1500, max: 2 }],
  rateCodes: [{ code: 'RO', desc: 'Room only', kind: 'pct', v: 0 }],
  rooms: [{ no: '101', type: 'DLX' }, { no: '102', type: 'DLX' }]
};
const bundle = propertyFromHubSnapshot(hub);
assert.equal(bundle.property.hubCode, 'DEMO1');
assert.equal(bundle.roomTypes[0].totalRooms, 2);
assert.ok(bundle.inventory.length >= 14);

const tmp = path.join(os.tmpdir(), `maha-connect-test-${Date.now()}.json`);
const store = createStore(tmp);
store.upsertPropertyBundle(bundle);
const db = store.read();
assert.equal(db.properties.length, 1);
assert.equal(readiness(db).liveOta, false);
assert.equal(readiness(db).version, CONNECT_VERSION);

const day = buildInventoryDay(bundle.roomTypes[0], bundle.inventory[0].stayDate, { sold: 1, ooo: 0 });
assert.equal(day.sellable, 1);

const mock = createMockAdapter();
assert.equal((await mock.connect()).ok, true);
assert.equal((await mock.testConnection()).ok, true);
assert.equal((await mock.pushAvailability([{ stayDate: '2026-10-02', sellable: 1 }])).ok, true);

const middle = createMiddleProviderAdapter();
assert.equal((await middle.connect()).ok, false);
assert.equal((await middle.testConnection()).ok, false);

fs.unlinkSync(tmp);
console.log('maha-connect foundation tests OK', CONNECT_VERSION);
