/** v1.3.0 — Strukturierter CV, Merk-/Ausschlussliste, Profilaufrufe, Rechnungsdaten. */

exports.up = async function up(knex) {
  await knex.schema.createTable('educations', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('abschluss').notNullable();
    t.string('institution');
    t.string('zeitraum'); // Freitext, z. B. "2010 – 2012"
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('career_steps', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('rolle').notNullable();
    t.string('firma'); // ggf. anonymisiert
    t.string('zeitraum');
    t.text('ergebnis'); // Kern-Resultat in 1–2 Sätzen
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('watchlist', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('notiz');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'expert_id']);
  });

  await knex.schema.createTable('blocklist', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('grund');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'expert_id']);
  });

  await knex.schema.alterTable('experts', (t) => {
    t.integer('profil_views').notNullable().defaultTo(0); // aggregierter Zähler (DSGVO-schonend)
    t.string('iban');
    t.string('bic');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => { t.dropColumn('profil_views'); t.dropColumn('iban'); t.dropColumn('bic'); });
  await knex.schema.dropTableIfExists('blocklist');
  await knex.schema.dropTableIfExists('watchlist');
  await knex.schema.dropTableIfExists('career_steps');
  await knex.schema.dropTableIfExists('educations');
};
