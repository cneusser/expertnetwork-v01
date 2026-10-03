/**
 * v1.39.0 — Projektabgleich mit Phalanx OS, Stufe 1: die Zuordnung.
 *
 * Die Projektnummer wird in Phalanx OS vergeben und ist der gemeinsame
 * Schlüssel. Hier wird sie nur getragen, nie erzeugt.
 *
 * Sie sitzt am Mandat und nicht am Experten. Ein Experte arbeitet im Lauf der
 * Zeit für mehrere Projekte, und am Experten wäre die Nummer schon beim
 * zweiten Mandat falsch.
 *
 * Projektname, Kategorie und Phase werden bewusst NICHT gespeichert. Sie
 * gehören Phalanx OS, werden von dort geholt und nur angezeigt. Eine Kopie
 * hier wäre am Tag nach der ersten Umbenennung falsch, und niemand würde es
 * merken.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('engagements', (t) => {
    // Fünfstellig: Stelle 1 bis 2 die Kategorie, Stelle 3 bis 5 fortlaufend.
    // Als Text, nicht als Zahl: Die führende Null von 10001 ist bedeutungstragend,
    // und gerechnet wird mit einer Projektnummer ohnehin nie.
    t.string('phalanx_projekt_nummer', 5).nullable();
    t.timestamp('phalanx_sync_am').nullable();
    t.text('phalanx_sync_fehler').nullable();
    t.index(['tenant_id', 'phalanx_projekt_nummer']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('engagements', (t) => {
    t.dropIndex(['tenant_id', 'phalanx_projekt_nummer']);
    t.dropColumn('phalanx_projekt_nummer');
    t.dropColumn('phalanx_sync_am');
    t.dropColumn('phalanx_sync_fehler');
  });
};
