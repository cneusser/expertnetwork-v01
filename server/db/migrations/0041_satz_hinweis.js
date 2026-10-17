/**
 * v1.47.1 — Was neben dem Tagessatz noch gilt.
 *
 * Auf der ersten echten Vorlage stand "1.860 EUR, Tagessatz zzgl. USt". Was
 * fehlte: "zzgl. Reisekosten". Der Kandidat hatte das ausdrücklich gesagt,
 * und bei einem Einsatz vor Ort in Nordrhein-Westfalen ist das kein Detail,
 * sondern leicht ein Fünftel der Rechnung.
 *
 * Ein Kunde, der nach Vertragsschluss von Reisekosten erfährt, fühlt sich
 * übervorteilt, auch wenn alles rechtens war. Deshalb steht es ab jetzt im
 * Profil, und zwar als Text: "zzgl. Reisekosten", "inkl. Reisekosten",
 * "Anfahrt pauschal 250 EUR" sind drei verschiedene Abmachungen, die sich
 * nicht in ein Häkchen pressen lassen.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('vorlage_positionen', (t) => {
    t.string('satz_hinweis', 200);
  });

  // Was der Experte generell vereinbart, als Vorbelegung für neue Vorlagen.
  await knex.schema.alterTable('experts', (t) => {
    t.string('spesen_regel', 200);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => t.dropColumn('spesen_regel'));
  await knex.schema.alterTable('vorlage_positionen', (t) => t.dropColumn('satz_hinweis'));
};
