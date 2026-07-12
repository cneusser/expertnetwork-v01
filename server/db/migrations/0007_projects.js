/** Sprint 6 — Interne Projekte + Bewerbungs-Pipeline. */

exports.up = async function up(knex) {
  await knex.schema.createTable('projects', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('name').notNullable();
    t.text('beschreibung');
    t.integer('budget_eur'); // Gesamtbudget (optional)
    t.integer('tagessatz_bis_eur'); // Satz-Obergrenze (optional)
    t.date('start');
    t.date('ende');
    t.string('ort');
    t.string('arbeitsmodell'); // remote|hybrid|vor_ort
    t.string('status').notNullable().defaultTo('entwurf'); // entwurf|offen|besetzt|geschlossen
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'status']);
  });

  await knex.schema.createTable('project_skills', (t) => {
    t.increments('id').primary();
    t.integer('project_id').notNullable().references('projects.id');
    t.integer('skill_id').notNullable().references('skills.id');
    t.unique(['project_id', 'skill_id']);
  });

  await knex.schema.createTable('applications', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('project_id').notNullable().references('projects.id');
    t.integer('expert_id').notNullable().references('experts.id');
    t.string('status').notNullable().defaultTo('vorgeschlagen'); // vorgeschlagen|beworben|im_gespraech|angeboten|abgelehnt|besetzt
    t.integer('matching_score');
    t.text('begruendung');
    t.text('nachricht'); // Kurznachricht des Experten bei Bewerbung
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['project_id', 'expert_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('applications');
  await knex.schema.dropTableIfExists('project_skills');
  await knex.schema.dropTableIfExists('projects');
};
