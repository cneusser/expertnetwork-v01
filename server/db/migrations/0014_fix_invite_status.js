/**
 * v1.3.0 — Datenheilung: Experten, die die Einladung bereits angenommen haben
 * (aktive Einwilligung vorhanden), aber wegen des Status-Bugs auf 'eingeladen'
 * blieben, werden auf 'freigegeben' gehoben. (accept-invite prüfte nur
 * 'registriert' — Kontakt-Importe starten aber mit 'eingeladen'.)
 */
exports.up = async function up(knex) {
  const rows = await knex('experts as e')
    .join('consents as c', 'c.user_id', 'e.user_id')
    .whereIn('e.status', ['eingeladen', 'registriert'])
    .whereNull('c.revoked_at')
    .where('c.expires_at', '>', knex.fn.now())
    .distinct('e.id');
  for (const r of rows) {
    await knex('experts').where({ id: r.id }).update({ status: 'freigegeben' });
    await knex('audit_log').insert({
      tenant_id: 1, action: 'expert.status_fix', resource: 'experts', resource_id: r.id,
      new_value_json: JSON.stringify({ status: 'freigegeben', grund: 'Einwilligung lag vor (Migration 0014)' }),
    });
  }
};
exports.down = async function down() {};
