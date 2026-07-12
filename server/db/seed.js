/**
 * Idempotentes Seeding (Lehre aus phalanx-v01):
 * Default-Tenant "phalanx" + Admin-User werden per UPSERT angelegt/aktualisiert,
 * sodass sie nach JEDEM frischen Deploy sicher existieren, verifiziert und
 * freigegeben sind. Läuft automatisch beim Serverstart (siehe index.js) und
 * manuell via `npm run seed`.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('./knex');

async function seed() {
  const [tenant] = await db('tenants')
    .insert({ slug: 'phalanx', name: 'Phalanx GmbH' })
    .onConflict('slug')
    .merge({ name: 'Phalanx GmbH' })
    .returning('*');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@phalanx.example';
  const adminPassword = process.env.ADMIN_PASSWORD || 'phalanx-admin-2026';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await db('users')
    .insert({
      tenant_id: tenant.id,
      email: adminEmail.toLowerCase(),
      password_hash: passwordHash,
      role: 'admin',
      email_verified_at: db.fn.now(),
      is_approved: true,
    })
    .onConflict('email')
    .merge({ role: 'admin', is_approved: true, email_verified_at: db.fn.now() });

  console.log(`Seed ok — Tenant "phalanx", Admin ${adminEmail}`);
  return tenant;
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
