/** v1.8.0 — Einladungs-Funnel: editierbare Mailvorlagen + Outbox (Versandprotokoll). */
exports.up = async function up(knex) {
  await knex.schema.createTable('mail_templates', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('key').notNullable(); // z. B. expert_invite
    t.string('subject').notNullable();
    t.text('body_text').notNullable(); // Platzhalter: {{vorname}}, {{nachname}}, {{link}}
    t.integer('updated_by');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'key']);
  });
  await knex.schema.createTable('mail_outbox', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id');
    t.string('to_email').notNullable();
    t.string('subject').notNullable();
    t.text('body_html');
    t.string('template_key');
    t.string('status').notNullable().defaultTo('gesendet'); // gesendet|fehler|stub
    t.text('fehler');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['created_at']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('mail_outbox');
  await knex.schema.dropTableIfExists('mail_templates');
};
