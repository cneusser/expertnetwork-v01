/** Sprint 7 — Kommunikation aus dem System (Einzel-/Serienmail, Terminanfrage). */

exports.up = async function up(knex) {
  await knex.schema.createTable('communications', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('typ').notNullable(); // einzelmail | serienmail | terminanfrage
    t.string('betreff').notNullable();
    t.text('body'); // personalisierter, tatsächlich versendeter Text
    t.integer('projekt_id').references('projects.id');
    t.integer('sent_by');
    t.string('status').notNullable().defaultTo('gesendet'); // gesendet | fehlgeschlagen
    t.string('fehler');
    t.timestamp('sent_at').defaultTo(knex.fn.now());
    t.index(['expert_id', 'sent_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('communications');
};
