/** v1.11.0 — Assoziierte Partner: öffentliche Interessensanfragen mit Triage. */
exports.up = async function up(knex) {
  await knex.schema.createTable('partner_applications', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('vorname').notNullable();
    t.string('nachname').notNullable();
    t.string('email').notNullable();
    t.string('telefon');
    t.jsonb('fokus_json').notNullable().defaultTo('[]'); // recruiting|akquise|delivery
    t.text('nachricht');
    t.string('status').notNullable().defaultTo('neu'); // neu|in_pruefung|angenommen|abgelehnt
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'status']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('partner_applications');
};
