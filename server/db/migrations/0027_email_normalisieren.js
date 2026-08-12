/**
 * v1.24.2 — E-Mail-Adressen vereinheitlichen.
 *
 * Die Anmeldung und der Passwort-Reset schreiben die Eingabe klein, bevor sie
 * suchen. Importierte Adressen standen aber so in der Datenbank, wie sie in der
 * Excel-Liste oder im Lebenslauf standen, also teils mit Großbuchstaben oder mit
 * Leerzeichen am Rand. Für diese Konten fand die Suche nichts: keine Anmeldung
 * und, noch unangenehmer, beim Passwort-Reset auch keine Fehlermeldung, weil die
 * Antwort aus Datenschutzgründen immer gleich lautet.
 *
 * Hier werden alle Adressen einmalig normalisiert. Wo dabei ein Duplikat
 * entstehen würde, bleibt der Datensatz unangetastet und wird nur protokolliert.
 */
exports.up = async function up(knex) {
  for (const tabelle of ['users', 'experts']) {
    const rows = await knex(tabelle).whereNotNull('email').select('id', 'email');
    for (const r of rows) {
      const sauber = String(r.email).trim().toLowerCase();
      if (sauber === r.email) continue;
      const kollision = await knex(tabelle).where({ email: sauber }).whereNot('id', r.id).first();
      if (kollision) {
        console.warn(`[0027] ${tabelle} #${r.id}: "${r.email}" bleibt, weil "${sauber}" schon existiert (#${kollision.id})`);
        continue;
      }
      await knex(tabelle).where({ id: r.id }).update({ email: sauber });
    }
  }
};

exports.down = async function down() {
  // Kleinschreibung lässt sich nicht sinnvoll zurückdrehen, absichtlich leer.
};
