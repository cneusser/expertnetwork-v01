/**
 * v1.12.0 — Matchingfunnel (Capitalmatch-Adaption) + Einladungs-Lebenszyklus.
 * - applications: stage_changed_at (Verweildauer je Stufe), next_step
 * - match_alerts: einmalige Projekt-Benachrichtigung je Experte (Dedupe)
 * - experts: Einladungs-Zyklus (neu: Erinnerung Tag 7 und 21, Löschung Tag 28;
 *   bestand: Nachfass sofort, Erinnerung Tag 7, Löschung Tag 14)
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('applications', (t) => {
    t.timestamp('stage_changed_at').defaultTo(knex.fn.now());
    t.string('next_step');
  });
  await knex.raw('UPDATE applications SET stage_changed_at = COALESCE(updated_at, created_at) WHERE stage_changed_at IS NULL');
  await knex.schema.createTable('match_alerts', (t) => {
    t.increments('id').primary();
    t.integer('project_id').notNullable();
    t.integer('expert_id').notNullable();
    t.integer('score');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['project_id', 'expert_id']);
  });
  await knex.schema.alterTable('experts', (t) => {
    t.timestamp('invite_cycle_started_at');
    t.string('invite_zyklus'); // neu | bestand
    t.integer('invite_reminders_sent').notNullable().defaultTo(0);
  });
};
exports.down = async function down(knex) {
  await knex.schema.alterTable('applications', (t) => { t.dropColumn('stage_changed_at'); t.dropColumn('next_step'); });
  await knex.schema.dropTableIfExists('match_alerts');
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('invite_cycle_started_at'); t.dropColumn('invite_zyklus'); t.dropColumn('invite_reminders_sent');
  });
};
