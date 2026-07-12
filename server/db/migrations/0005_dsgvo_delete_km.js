/**
 * v0.4.3 — DSGVO-Löschung: Klaus Müller (Admin-Entscheidung, es lag keine
 * Einwilligung vor; Profil war in v0.4.2 administrativ importiert worden).
 * Personenbezogene Daten werden vollständig entfernt; Audit-Einträge werden
 * anonymisiert (dafür wird der Append-only-Trigger einmalig, dokumentiert
 * und versioniert deaktiviert) und ein Lösch-Nachweis protokolliert.
 */

const EMAIL = 'klaus.kl.mueller@gmail.com';

exports.up = async function up(knex) {
  const user = await knex('users').where({ email: EMAIL }).first();
  const expert = user ? await knex('experts').where({ user_id: user.id }).first() : null;

  if (expert) {
    await knex('expert_skills').where({ expert_id: expert.id }).del();
    await knex('availabilities').where({ expert_id: expert.id }).del();
    await knex('rates').where({ expert_id: expert.id }).del();
    await knex('documents').where({ expert_id: expert.id }).del();

    await knex.raw('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_immutable');
    await knex('audit_log')
      .where({ resource: 'experts', resource_id: expert.id })
      .update({
        old_value_json: null,
        new_value_json: JSON.stringify({ hinweis: 'Inhalt entfernt — DSGVO-Löschung (Migration 0005)' }),
      });
    await knex.raw('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_immutable');

    await knex('experts').where({ id: expert.id }).del();
  }
  if (user) {
    await knex('consents').where({ user_id: user.id }).del();
    await knex('users').where({ id: user.id }).del();
  }

  const tenant = await knex('tenants').where({ slug: 'phalanx' }).first();
  if (tenant) {
    await knex('audit_log').insert({
      tenant_id: tenant.id,
      action: 'expert.dsgvo_delete',
      resource: 'experts',
      new_value_json: JSON.stringify({
        grund: 'Löschung auf Admin-Anweisung; keine Einwilligung vorhanden (Art. 17 DSGVO)',
      }),
    });
  }
};

exports.down = async function down() {
  // Bewusst kein Rollback — gelöschte personenbezogene Daten werden nicht wiederhergestellt.
};
