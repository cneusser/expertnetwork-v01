/**
 * Sprint 8 — Vendor-Portal + Multi-Tenant scharf schalten.
 * Neue Rollen (users.role): tenant_owner (Admin des eigenen Mandanten),
 * vendor (Kunde: reicht Projekte ein, sieht nur freigegebene Profile).
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('projects', (t) => {
    t.integer('vendor_id').references('users.id'); // eingereicht durch Kunden (Status 'eingereicht')
  });

  // Kuratierte Profil-Freigaben je Projekt (optional anonymisiert)
  await knex.schema.createTable('project_releases', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('project_id').notNullable().references('projects.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.boolean('anonymized').notNullable().defaultTo(true);
    t.integer('released_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['project_id', 'expert_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('project_releases');
  await knex.schema.alterTable('projects', (t) => t.dropColumn('vendor_id'));
};
