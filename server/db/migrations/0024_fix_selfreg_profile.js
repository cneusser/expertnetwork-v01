/**
 * v1.19.1 — Datenheilung: Selbstregistrierte Experten hatten bis dahin kein
 * Expertenprofil (nur ein Konto), tauchten also in der Verwaltung nicht auf.
 * Diese Migration legt fuer jedes Konto mit Rolle expert ohne Profil eines an.
 */
exports.up = async function up(knex) {
  const ohne = await knex('users as u')
    .leftJoin('experts as e', 'e.user_id', 'u.id')
    .where('u.role', 'expert')
    .whereNull('e.id')
    .select('u.id', 'u.email', 'u.tenant_id');
  for (const u of ohne) {
    const lokalteil = String(u.email).split('@')[0].replace(/[._-]+/g, ' ').trim();
    const teile = lokalteil.split(' ').filter(Boolean);
    const gross = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
    await knex('experts').insert({
      tenant_id: u.tenant_id,
      user_id: u.id,
      vorname: gross(teile[0]) || 'Unbekannt',
      nachname: gross(teile.slice(1).join(' ')) || '(offen)',
      email: u.email,
      status: 'registriert',
      kurzprofil: '[Selbstregistrierung] Name aus der E-Mail-Adresse abgeleitet, bitte pruefen.',
    });
    await knex('audit_log').insert({
      tenant_id: u.tenant_id, action: 'expert.profil_nachgetragen', resource: 'users', resource_id: u.id,
      new_value_json: JSON.stringify({ grund: 'Selbstregistrierung ohne Profil (Migration 0024)' }),
    }).catch(() => {});
  }
};
exports.down = async function down() {};
