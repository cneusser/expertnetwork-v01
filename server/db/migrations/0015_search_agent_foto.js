/** v1.4.0 — Suchagent (gespeicherte Suche als Agent) + Profilbild. */
exports.up = async function up(knex) {
  await knex.schema.alterTable('saved_searches', (t) => {
    t.boolean('agent_aktiv').notNullable().defaultTo(false);
    t.jsonb('last_result_ids').notNullable().defaultTo('[]');
    t.timestamp('last_run_at');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.string('foto_pfad');
  });
};
exports.down = async function down(knex) {
  await knex.schema.alterTable('saved_searches', (t) => {
    t.dropColumn('agent_aktiv'); t.dropColumn('last_result_ids'); t.dropColumn('last_run_at');
  });
  await knex.schema.alterTable('experts', (t) => { t.dropColumn('foto_pfad'); });
};
