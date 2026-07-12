// Knex-Konfiguration — nutzt DATABASE_URL (Railway-Postgres-Plugin).
// Lokal: siehe README ("Lokale Entwicklung").
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 10 },
  migrations: { directory: './db/migrations' },
};
