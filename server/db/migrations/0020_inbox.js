/** v1.14.0 — Zwei-Wege-Kommunikation: Posteingang für Antworten (Brevo Inbound). */
exports.up = async function up(knex) {
  await knex.schema.createTable('mail_inbox', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id');
    t.string('from_email').notNullable();
    t.string('from_name');
    t.string('subject');
    t.text('body_text');
    t.text('body_html');
    t.integer('expert_id'); // Zuordnung über Absenderadresse, wenn möglich
    t.integer('user_id');
    t.boolean('gelesen').notNullable().defaultTo(false);
    t.timestamp('beantwortet_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['gelesen']);
    t.index(['expert_id']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('mail_inbox');
};
