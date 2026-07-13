/** v1.2.0 — Hidden-Links für Kunden-Shortlists (Token-URL, Ablauf, Widerruf, Zugriffszähler). */

exports.up = async function up(knex) {
  await knex.schema.createTable('share_links', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('project_id').notNullable().references('projects.id');
    t.string('token').notNullable().unique();
    t.timestamp('expires_at');
    t.timestamp('revoked_at');
    t.integer('zugriffe').notNullable().defaultTo(0);
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('share_links');
};
