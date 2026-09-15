/**
 * v1.12.0 — Zentrale Art.-17-Löschung (aus der Admin-Route extrahiert, damit
 * der Einladungs-Lebenszyklus dieselbe Kaskade nutzt). Entfernt Profil,
 * Verknüpfungen, Dateien, Konto und Einwilligungen, anonymisiert Audit-Einträge
 * (Append-only-Trigger dafür kurz und protokolliert deaktiviert) und schreibt
 * einen Lösch-Nachweis. Räumt auch CV-Struktur, Merk-/Ausschlusslisten,
 * Match-Alerts und Outbox-Einträge der Person mit ab.
 */
const { db } = require('../db/knex');
const storage = require('../providers/storage');

async function deleteExpertCascade(expert, { tenantId, actorId = null, grund, ip = null }) {
  const docs = await db('documents').where({ expert_id: expert.id });
  for (const d of docs) {
    try { await storage.remove(d.storage_ref); } catch (e) { console.error('Datei-Löschung:', e.message); }
  }
  if (expert.foto_pfad) { try { await storage.remove(expert.foto_pfad); } catch (e) { console.error('Foto-Löschung:', e.message); } }

  // handover_tokens ab v1.28.0: kam mit v1.27.0 dazu und fehlte hier. Ohne den
  // Eintrag scheiterte die Löschung an der Fremdschlüsselbeziehung, sobald für
  // die Person einmal ein Capitalmatch-Übergabelink erzeugt worden war.
  for (const tabelle of ['project_releases', 'applications', 'communications', 'documents',
    'availabilities', 'rates', 'expert_skills', 'educations', 'career_steps',
    'watchlist', 'blocklist', 'match_alerts', 'ratings', 'handover_tokens']) {
    await db(tabelle).where({ expert_id: expert.id }).delete().catch(() => {});
  }
  if (expert.email) await db('mail_outbox').where({ to_email: expert.email }).delete().catch(() => {});

  await db.raw('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_immutable');
  await db('audit_log')
    .where({ resource: 'experts', resource_id: expert.id })
    .update({
      old_value_json: null,
      new_value_json: JSON.stringify({ hinweis: 'Inhalt entfernt, DSGVO-Löschung' }),
    });
  await db.raw('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_immutable');

  await db('experts').where({ id: expert.id }).delete();
  if (expert.user_id) {
    await db('consents').where({ user_id: expert.user_id }).delete();
    await db('saved_searches').where({ user_id: expert.user_id }).delete();
    await db('users').where({ id: expert.user_id, role: 'expert' }).delete();
  }

  await db('audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action: 'expert.dsgvo_delete',
    resource: 'experts',
    new_value_json: JSON.stringify({ grund, dokumente_geloescht: docs.length }),
    ip,
  });
  return { dokumente: docs.length };
}

module.exports = { deleteExpertCascade };
