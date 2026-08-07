/**
 * v1.23.0 — Abrechnung I: Mandate, Leistungsnachweise, Belege.
 *
 * engagements: ein besetztes Projekt mit einem Experten, inklusive Konditionen
 *   (Einkaufssatz Experte, Verkaufssatz Kunde, Gebuehrenmodell aus dem Projekt).
 * timesheets: Leistungsnachweis je Monat (Tage, Spesen), vom Experten eingereicht
 *   und vom Admin freigegeben.
 * invoices: erzeugte Belege, je Nachweis eine Gutschrift an den Experten und eine
 *   Rechnung an den Kunden. Betraege werden beim Erzeugen eingefroren.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('engagements', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('project_id').notNullable().references('projects.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('titel'); // frei, sonst Projektname
    t.date('start');
    t.date('ende');
    t.integer('tagessatz_experte_eur').notNullable(); // Einkauf, geht an den Interimer
    t.integer('tagessatz_kunde_eur'); // Verkauf; leer = aus Gebuehrenmodell gerechnet
    t.string('gebuehr_modell').notNullable().defaultTo('gu_anteil'); // gu_anteil | erfolg
    t.integer('gebuehr_prozent').notNullable().defaultTo(15);
    t.integer('plan_tage'); // Basis fuer die einmalige Erfolgsgebuehr
    t.integer('ust_prozent').notNullable().defaultTo(19);
    t.jsonb('kunde_json').defaultTo('{}'); // firma, adresse, ustid, email, ansprechpartner
    t.jsonb('experte_json').defaultTo('{}'); // firma, adresse, ustid, iban (Stand bei Anlage)
    t.string('status').notNullable().defaultTo('aktiv'); // aktiv | beendet
    t.text('notiz');
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['project_id', 'expert_id']);
    t.index(['tenant_id', 'status']);
  });

  await knex.schema.createTable('timesheets', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('engagement_id').notNullable().references('engagements.id');
    t.string('periode').notNullable(); // YYYY-MM
    t.decimal('tage', 6, 2).notNullable().defaultTo(0);
    t.integer('spesen_eur').notNullable().defaultTo(0);
    t.text('beschreibung');
    t.string('status').notNullable().defaultTo('offen'); // offen | eingereicht | freigegeben | abgerechnet
    t.timestamp('eingereicht_at');
    t.timestamp('freigegeben_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['engagement_id', 'periode']);
  });

  await knex.schema.createTable('invoices', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('engagement_id').notNullable().references('engagements.id');
    t.integer('timesheet_id').references('timesheets.id');
    t.string('typ').notNullable(); // gutschrift (an Experte) | rechnung (an Kunde)
    t.string('beleg_nr').notNullable();
    t.date('datum').notNullable();
    t.string('periode');
    t.jsonb('empfaenger_json').defaultTo('{}');
    t.jsonb('positionen_json').defaultTo('[]');
    t.integer('netto_cent').notNullable();
    t.integer('ust_prozent').notNullable();
    t.integer('ust_cent').notNullable();
    t.integer('brutto_cent').notNullable();
    t.string('status').notNullable().defaultTo('offen'); // offen | versendet | bezahlt | storniert
    t.timestamp('versendet_at');
    t.timestamp('bezahlt_at');
    t.string('pdf_ref');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'beleg_nr']);
    t.index(['tenant_id', 'typ', 'status']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('timesheets');
  await knex.schema.dropTableIfExists('engagements');
};
