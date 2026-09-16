/**
 * 0033 — Kapitalpartner.
 *
 * Eine Rolle, die das Netzwerk bisher nicht kannte. Ein Kapitalpartner liefert
 * keine Leistung, sondern Geld: Leasing, Mietkauf, Sale and lease back,
 * Factoring, Mezzanine, Working Capital. Deshalb passt für ihn nichts von dem,
 * was einen Interim Manager ausmacht. Kein Tagessatz, keine Verfügbarkeit, kein
 * Lebenslauf, keine Skills, und vor allem keine 14-Tage-Schleife mit der Frage,
 * ob er gerade frei ist. Ein Leasinghaus ist immer frei.
 *
 * Eigene Tabelle statt einer weiteren Zielgruppe am Expertenprofil, weil sonst
 * jede Auswertung, jeder Scheduler-Job und jede Suche eine Sonderregel bräuchte.
 * Die Verfügbarkeitsschleife und die Profil-Erinnerung laufen über `experts`,
 * hier greifen sie schlicht nicht.
 *
 * Das wichtigste Feld ist `bonitaet_json`. Fast jeder Finanzierer kann gute
 * Bonität. Wertvoll für ein Sanierungsgeschäft sind die, die auch bei
 * schwacher Bonität, in Eigenverwaltung oder im StaRUG-Verfahren noch
 * finanzieren. Genau danach muss sich suchen lassen.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('kapitalpartner', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('expert_id').references('experts.id'); // falls aus einem Kontakt umgewandelt
    t.integer('user_id').references('users.id');     // optional, für späteren Self-Service

    t.string('firmenname').notNullable();
    t.string('anrede');
    t.string('vorname');
    t.string('nachname');
    t.string('email');
    t.string('telefon');
    t.string('webseite');
    t.string('linkedin');

    t.jsonb('finanzierungsarten_json').notNullable().defaultTo('[]');
    t.jsonb('objektarten_json').notNullable().defaultTo('[]'); // Freitext, z. B. Kräne, Medizintechnik
    t.jsonb('branchen_json').notNullable().defaultTo('[]');
    t.jsonb('bonitaet_json').notNullable().defaultTo('[]');     // das Unterscheidungsmerkmal
    t.integer('volumen_von_eur');
    t.integer('volumen_bis_eur');
    t.string('regionen');
    t.integer('entscheidung_tage'); // wie schnell eine Zusage realistisch ist
    t.text('beschreibung');
    t.text('referenzen');
    t.text('notiz'); // intern, geht nie nach außen

    t.string('status').notNullable().defaultTo('neu'); // neu|in_pruefung|freigegeben|abgelehnt
    t.string('quelle'); // landingpage | admin | umgewandelt
    t.timestamp('freigegeben_am');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());

    t.index(['tenant_id', 'status']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('kapitalpartner');
};
