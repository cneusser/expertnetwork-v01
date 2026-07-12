/** Sprint 2 — Tracking-Spalten für Erinnerungs-Loops (14-Tage-Verfügbarkeit, Consent-Ablauf). */

exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.timestamp('last_availability_reminder_at');
    t.timestamp('last_consent_reminder_at');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('last_availability_reminder_at');
    t.dropColumn('last_consent_reminder_at');
  });
};
