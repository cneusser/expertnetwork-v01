/**
 * v1.25.0 — Vorregistrierung aus Kontaktlisten.
 *
 * Kontakte aus dem eigenen Netzwerk werden vorbereitet abgelegt, ohne Konto und
 * ohne Einwilligung. Sie werden ausschließlich persönlich über LinkedIn
 * angesprochen, bekommen also keine Mail von der Plattform. Registriert sich
 * jemand später über den allgemeinen Link, wird der vorbereitete Datensatz
 * übernommen statt ein zweiter angelegt.
 *
 * Neuer Statuswert: vorregistriert (kein user_id, kein Consent).
 * Zuordnungsschlüssel: name_key, dazu die schon vorhandenen Felder email und linkedin.
 */
const { nameKey, linkedinKey } = require('../../utils/normalisieren');

exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.string('vorreg_quelle');           // z. B. "LinkedIn-Export 2026-08-27"
    t.string('vorreg_prio');             // A | B | C
    t.string('vorreg_kanal');            // linkedin | email
    t.date('vorreg_letzter_kontakt');    // letzter Kontakt laut Liste
    t.date('vorreg_angeschrieben_am');   // von Hand gepflegt, sobald die Nachricht raus ist
    t.timestamp('vorreg_importiert_am'); // Start der Löschfrist
    t.timestamp('vorreg_zusammengefuehrt_am');
    t.string('name_key');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.index(['tenant_id', 'name_key'], 'experts_tenant_namekey_idx');
    t.index(['tenant_id', 'vorreg_prio'], 'experts_tenant_vorregprio_idx');
  });

  // Backfill: Namensschlüssel für alle vorhandenen Experten, LinkedIn vereinheitlichen.
  const rows = await knex('experts').select('id', 'vorname', 'nachname', 'linkedin');
  for (const r of rows) {
    const patch = { name_key: nameKey(r.vorname, r.nachname) };
    const li = linkedinKey(r.linkedin);
    if (li && li !== r.linkedin) patch.linkedin = li;
    await knex('experts').where({ id: r.id }).update(patch);
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'name_key'], 'experts_tenant_namekey_idx');
    t.dropIndex(['tenant_id', 'vorreg_prio'], 'experts_tenant_vorregprio_idx');
  });
  await knex.schema.alterTable('experts', (t) => {
    ['vorreg_quelle', 'vorreg_prio', 'vorreg_kanal', 'vorreg_letzter_kontakt',
      'vorreg_angeschrieben_am', 'vorreg_importiert_am', 'vorreg_zusammengefuehrt_am', 'name_key']
      .forEach((c) => t.dropColumn(c));
  });
};
