/**
 * v1.27.0 — Übergabe an Capitalmatch.
 *
 * Nicht jeder im Netzwerk gehört ins Expert Network. Unternehmensnachfolger
 * wollen kein Mandat, sie wollen ein Unternehmen. Für sie gibt es Capitalmatch.
 *
 * Der Weg dorthin läuft in zwei Schritten, damit keine Personendaten in einer
 * URL landen und niemand einen Link erraten kann:
 *   1. Wir erzeugen eine zufällige Kennung und geben Christian den Link.
 *   2. Capitalmatch löst die Kennung server-zu-server gegen die Vorbelegung ein,
 *      mit gemeinsamem Schlüssel im Header.
 *
 * Das ist im Kleinen der Ablauf, den später der gemeinsame Anmeldedienst
 * (Phalanx ID, v2.0) übernimmt. Nichts davon ist wegwerfbar.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    // interim | cfo | nachfolger | null. Steuert, wohin die Ansprache führt.
    t.string('zielgruppe');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.index(['tenant_id', 'zielgruppe'], 'experts_tenant_zielgruppe_idx');
  });

  await knex.schema.createTable('handover_tokens', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('ziel').notNullable().defaultTo('capitalmatch');
    t.string('token').notNullable().unique(); // zufällig, nicht ableitbar
    t.timestamp('expires_at').notNullable();
    t.timestamp('abgerufen_at');   // wann Capitalmatch die Daten geholt hat
    t.timestamp('eingeloest_at');  // wann sich die Person dort registriert hat
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'expert_id'], 'handover_tenant_expert_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('handover_tokens');
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'zielgruppe'], 'experts_tenant_zielgruppe_idx');
  });
  await knex.schema.alterTable('experts', (t) => { t.dropColumn('zielgruppe'); });
};
