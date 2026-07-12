const knex = require('knex');
const config = require('../knexfile');

const db = knex(config);

/**
 * Tenant-gefilterter Query-Helper — Grundregel des Projekts:
 * KEIN direkter Tabellenzugriff in Routen, immer über forTenant().
 * (Sprint 8 verschärft das per Lint/Test.)
 */
function forTenant(tenantId, table) {
  if (!tenantId) throw new Error('forTenant: tenantId fehlt');
  return db(table).where({ [`${table}.tenant_id`]: tenantId });
}

module.exports = { db, forTenant };
