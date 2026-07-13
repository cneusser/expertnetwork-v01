/** v1.1.0 — Kunden-Self-Service: Registrierung, Ausschreibungs-Wizard, Gebühren, Feedback. */

exports.up = async function up(knex) {
  await knex.schema.alterTable('projects', (t) => {
    t.string('referenz'); // z. B. PHX-A3F9
    t.timestamp('bewerbungsfrist');
    t.integer('auslastung_prozent');
    t.integer('remote_anteil'); // 0–100
    t.integer('tagessatz_von_eur');
    t.string('gebuehr_modell'); // gu_anteil | erfolg
    t.integer('gebuehr_prozent');
  });

  await knex.schema.createTable('vendor_profiles', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id').unique();
    t.string('firmenname').notNullable();
    t.string('branche');
    t.string('telefon');
    t.jsonb('adresse_json').defaultTo('{}');
    t.jsonb('ansprechpartner_json').defaultTo('{}'); // anrede, titel, vorname, nachname, position
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('vendor_favorites', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'expert_id']);
  });

  await knex.schema.alterTable('project_releases', (t) => {
    t.string('feedback'); // interessant | gespraech_angefragt | absage
    t.timestamp('feedback_at');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('project_releases', (t) => { t.dropColumn('feedback'); t.dropColumn('feedback_at'); });
  await knex.schema.dropTableIfExists('vendor_favorites');
  await knex.schema.dropTableIfExists('vendor_profiles');
  await knex.schema.alterTable('projects', (t) => {
    ['referenz', 'bewerbungsfrist', 'auslastung_prozent', 'remote_anteil', 'tagessatz_von_eur', 'gebuehr_modell', 'gebuehr_prozent']
      .forEach((c) => t.dropColumn(c));
  });
};
