/**
 * Mock channel adapter — behaves like a real adapter without external network.
 * Phase 1: connect / test / rooms / rates / push stubs only.
 */

export function createMockAdapter(connection = {}) {
  const state = {
    connected: connection.status === 'connected',
    lastError: null,
    pushed: []
  };

  return {
    code: 'MOCK',
    async connect() {
      state.connected = true;
      state.lastError = null;
      return { ok: true, status: 'connected' };
    },
    async disconnect() {
      state.connected = false;
      return { ok: true, status: 'disconnected' };
    },
    async testConnection() {
      if (!state.connected) return { ok: false, status: 'disconnected', error: 'Not connected' };
      return { ok: true, status: 'connected', latencyMs: 12 };
    },
    async getProperty() {
      return { ok: true, property: { externalId: 'MOCK-PROP-1', name: 'Mock Property' } };
    },
    async getRooms() {
      return {
        ok: true,
        rooms: [
          { externalId: 'MOCK-DLX', name: 'Mock Deluxe' },
          { externalId: 'MOCK-STD', name: 'Mock Standard' }
        ]
      };
    },
    async getRates() {
      return {
        ok: true,
        rates: [
          { externalId: 'MOCK-BAR', name: 'Mock BAR' },
          { externalId: 'MOCK-NR', name: 'Mock Non-Refundable' }
        ]
      };
    },
    async getReservations() {
      return { ok: true, reservations: [] };
    },
    async pushAvailability(data) {
      state.pushed.push({ type: 'availability', at: new Date().toISOString(), data });
      return { ok: true, accepted: Array.isArray(data) ? data.length : 1 };
    },
    async pushRates(data) {
      state.pushed.push({ type: 'rates', at: new Date().toISOString(), data });
      return { ok: true, accepted: Array.isArray(data) ? data.length : 1 };
    },
    async pushRestrictions(data) {
      state.pushed.push({ type: 'restrictions', at: new Date().toISOString(), data });
      return { ok: true, accepted: Array.isArray(data) ? data.length : 1 };
    },
    _debug() {
      return { connected: state.connected, pushedCount: state.pushed.length };
    }
  };
}
