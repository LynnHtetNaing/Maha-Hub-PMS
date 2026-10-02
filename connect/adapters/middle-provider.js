/**
 * Middle connectivity provider adapter (Phase 1 placeholder).
 * No network calls. Wire real API only after provider selection + contract.
 * See docs/maha-connect/PROVIDER-CRITERIA.md
 */

export function createMiddleProviderAdapter(_connection = {}, _env = {}) {
  const notConfigured = (method) => ({
    ok: false,
    status: 'not_configured',
    error: `Middle provider adapter is a placeholder. ${method} is unavailable until a certified provider is selected and credentials are configured in server env (never in the browser).`
  });

  return {
    code: 'MIDDLE',
    async connect() { return notConfigured('connect'); },
    async disconnect() { return { ok: true, status: 'disconnected' }; },
    async testConnection() { return notConfigured('testConnection'); },
    async getProperty() { return notConfigured('getProperty'); },
    async getRooms() { return notConfigured('getRooms'); },
    async getRates() { return notConfigured('getRates'); },
    async getReservations() { return notConfigured('getReservations'); },
    async pushAvailability() { return notConfigured('pushAvailability'); },
    async pushRates() { return notConfigured('pushRates'); },
    async pushRestrictions() { return notConfigured('pushRestrictions'); }
  };
}
