/**
 * Sprint 1 — Expert Directory + Dokumenten-Tresor.
 * Zusätzlich vorgezogen (Datenmodell aus Sprint 2/3, UI folgt später):
 * availabilities und rates — beide Insert-only (Historie = Audit gratis).
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('experts', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').references('users.id');
    t.string('status').notNullable().defaultTo('registriert'); // eingeladen|registriert|freigegeben|inaktiv
    t.string('vorname').notNullable();
    t.string('nachname').notNullable();
    t.string('firma');
    t.string('berufsbezeichnung');
    t.text('kurzprofil');
    t.jsonb('adresse_json').defaultTo('{}');
    t.string('telefon');
    t.string('mobil');
    t.string('email');
    t.string('linkedin');
    t.string('webseite');
    t.string('ust_id');
    t.string('steuernummer');
    t.string('ort');
    t.string('land');
    t.string('reisebereitschaft');
    t.string('arbeitsmodell'); // remote|hybrid|vor_ort
    t.jsonb('sprachen_json').defaultTo('[]');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'status']);
  });

  await knex.schema.createTable('skills', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable().unique();
    t.string('kategorie').notNullable(); // kompetenz|technologie|rolle|branche|zertifikat
    t.boolean('is_approved').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('expert_skills', (t) => {
    t.increments('id').primary();
    t.integer('expert_id').notNullable().references('experts.id');
    t.integer('skill_id').notNullable().references('skills.id');
    t.string('level');
    t.integer('jahre');
    t.unique(['expert_id', 'skill_id']);
  });

  await knex.schema.createTable('documents', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('kategorie').notNullable(); // cv|executive_profil|one_pager|projektliste|zertifikat|nda|referenz
    t.string('sprache'); // de|en
    t.string('filename').notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.string('storage_ref').notNullable();
    t.string('mimetype');
    t.integer('size_bytes');
    t.integer('uploaded_by');
    t.timestamp('uploaded_at').defaultTo(knex.fn.now());
    t.index(['expert_id', 'kategorie']);
  });

  await knex.schema.createTable('availabilities', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('status').notNullable(); // sofort|ab_datum|teilweise|ausgebucht
    t.date('ab_datum');
    t.integer('auslastung_prozent'); // 20|40|60|80|100
    t.string('kommentar');
    t.timestamp('confirmed_at');
    t.string('source').notNullable().defaultTo('self'); // self|admin|reminder_link
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['expert_id', 'created_at']);
  });

  await knex.schema.createTable('rates', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('kategorie').notNullable(); // remote|vor_ort|interim|projektleitung|beratung
    t.integer('satz_von_eur').notNullable();
    t.integer('satz_bis_eur'); // null = Festsatz
    t.date('gueltig_ab').notNullable();
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['expert_id', 'kategorie', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('rates');
  await knex.schema.dropTableIfExists('availabilities');
  await knex.schema.dropTableIfExists('documents');
  await knex.schema.dropTableIfExists('expert_skills');
  await knex.schema.dropTableIfExists('skills');
  await knex.schema.dropTableIfExists('experts');
};
