/**
 * v1.44.0 — Die Kandidatenanfrage, und die Pipeline als einzige Liste.
 *
 * Bisher gab es zwei Listen nebeneinander: die Pipeline und, seit v1.43.0,
 * eine zweite Auswahl für die Vorlage. Dieselben Menschen, zweimal
 * angekreuzt. Das war ein Baufehler, keine Absicht.
 *
 * Die Pipeline ist die Liste. Ihr Status bildet jetzt die ganze Strecke ab:
 *
 *   vorgeschlagen   steht zur Auswahl
 *   angefragt       anonym gefragt, ob Interesse besteht
 *   interessiert    hat zugesagt, mit Verfügbarkeit
 *   abgesagt        hat abgesagt, mit Grund
 *   vorgelegt       beim Kunden in einer Vorlage
 *   im_gespraech    Kunde will kennenlernen
 *   angeboten, besetzt, abgelehnt   wie bisher
 *
 * Die Reihenfolge ist eine Richtung, kein Zwang: Wer jemanden ohne Vorabfrage
 * direkt vorlegen will, soll das können.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('applications', (t) => {
    // Die anonyme Anfrage an den Kandidaten.
    t.string('anfrage_token', 64).unique();
    t.timestamp('anfrage_am');
    t.timestamp('anfrage_frist');

    // Was zurückkam. "verfuegbar_ab" ist bewusst Text und kein Datum:
    // "ab Mitte November" und "sofort, aber nur 3 Tage" sind Antworten, die
    // ein Datumsfeld zerstören würde.
    t.string('antwort', 20);          // interessiert | abgesagt
    t.timestamp('antwort_am');
    t.string('verfuegbar_ab', 80);
    t.string('auslastung', 40);
    t.text('antwort_notiz');
    t.integer('wunsch_satz_eur');     // falls der Kandidat für dieses Projekt anders rechnet

    t.index(['tenant_id', 'antwort']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('applications', (t) => {
    t.dropIndex(['tenant_id', 'antwort']);
    t.dropColumn('anfrage_token'); t.dropColumn('anfrage_am'); t.dropColumn('anfrage_frist');
    t.dropColumn('antwort'); t.dropColumn('antwort_am');
    t.dropColumn('verfuegbar_ab'); t.dropColumn('auslastung');
    t.dropColumn('antwort_notiz'); t.dropColumn('wunsch_satz_eur');
  });
};
