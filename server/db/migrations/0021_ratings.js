/**
 * v1.15.0 — Bewertungen: intern (Admin, 4 Kriterien) und Kunde (Token-Link,
 * Sterne + Freitext, einmalig einloesbar). Bewertungen sind personenbezogene
 * Daten: sie werden bei der Art.-17-Loeschung mit entfernt und erscheinen
 * im DSGVO-Export des Experten.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('ratings', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable();
    t.integer('expert_id').notNullable();
    t.string('typ').notNullable(); // intern | kunde
    t.integer('project_id');
    t.integer('sterne'); // 1..5, bei Kunden-Links erst nach Einloesung
    t.jsonb('kriterien_json'); // intern: { fachlichkeit, zuverlaessigkeit, kommunikation, wirkung }
    t.text('kommentar');
    t.string('kunde_email');
    t.string('token').unique(); // nur typ kunde
    t.timestamp('eingeloest_at');
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['expert_id', 'typ']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ratings');
};
