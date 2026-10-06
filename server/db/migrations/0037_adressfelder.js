/**
 * v1.41.0 — Adressfelder nach deutschem Standard.
 *
 * Bisher lag die Adresse in `adresse_json`, einem freien Objekt mit
 * strasse/plz/ort/land, in dem die Hausnummer in der Straße mitlief. Damit
 * lässt sich nicht nach Ort gruppieren, nicht sauber adressieren und erst
 * recht nichts mit Phalanx OS abgleichen.
 *
 * Die Feldnamen sind vorgegeben, weil Phalanx OS und CapitalMatch dieselben
 * führen. Drei Entscheidungen, die man leicht falsch trifft:
 *
 *   plz ist Text, keine Zahl. 01067 wird als Zahl zu 1067, und Dresden liegt
 *   dann nirgends.
 *
 *   hausnummer ist Text, keine Zahl. "28a", "12-14" und "3 1/2" sind keine
 *   Zahlen, und genau die kommen vor.
 *
 *   land ist zwei Zeichen nach ISO-3166-1 alpha-2. "Deutschland",
 *   "deutschland" und "GER" sind drei Schreibweisen desselben Landes, und
 *   wer sie zulässt, sortiert hinterher drei Gruppen.
 *
 * Die Anzeigezeile wird NICHT gespeichert. Sie entsteht bei der Ausgabe aus
 * den Feldern. Eine gespeicherte Anzeigezeile ist am Tag nach der ersten
 * Korrektur falsch, und niemand sieht es.
 *
 * `adresse_json` bleibt stehen. Es wird erst dann überflüssig, wenn die
 * Zerlegung bestätigt ist, und bis dahin ist es das Original, auf das man
 * zurückgehen kann.
 */

/** Dieselben acht Felder an jeder Tabelle, die eine Anschrift führt. */
function adressfelder(t) {
  t.string('strasse', 200);
  t.string('hausnummer', 20);
  t.string('adresszusatz', 200);
  t.string('plz', 10);
  t.string('ort', 120);
  t.string('land', 2).defaultTo('DE');
  // Woher die Angabe stammt: erfasst, zerlegt, pool, import.
  // Ohne Herkunft weiß man bei einer Abweichung nicht, welcher Seite man glaubt.
  t.string('adresse_quelle', 40);
  t.timestamp('adresse_am');
}

exports.up = async function up(knex) {
  // experts.ort gibt es schon aus 0002 und steht dort für den Arbeitsort in
  // der Suche, nicht für die Anschrift. Die Spalte bleibt, wie sie ist:
  // Umwidmen hieße, zwei Bedeutungen in einer Spalte zu führen.
  await knex.schema.alterTable('experts', (t) => {
    t.string('strasse', 200);
    t.string('hausnummer', 20);
    t.string('adresszusatz', 200);
    t.string('plz', 10);
    t.string('adresse_ort', 120); // Anschrift, getrennt vom Arbeitsort
    t.string('adresse_land', 2).defaultTo('DE');
    t.string('adresse_quelle', 40);
    t.timestamp('adresse_am');
    // Das Original, solange die Zerlegung nicht bestätigt ist.
    t.text('adresse_roh');
    t.index(['tenant_id', 'plz']);
  });

  await knex.schema.alterTable('vendor_profiles', (t) => {
    adressfelder(t);
    t.text('adresse_roh');
  });

  /**
   * Vorschläge aus dem Zerleger und aus dem Pool-Abgleich.
   *
   * Nichts davon wird automatisch übernommen. Eine Adresse, die sich von
   * allein ändert, merkt niemand, und bei einer Rechnungsanschrift ist das
   * teuer.
   */
  await knex.schema.createTable('adresse_vorschlag', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('subjekt_typ', 20).notNullable(); // expert | kunde
    t.integer('subjekt_id').notNullable();
    t.string('herkunft', 20).notNullable(); // zerleger | pool
    t.text('original');
    t.jsonb('vorschlag_json').defaultTo('{}');
    // sicher: kann übernommen werden. meldung: jemand muss hinsehen.
    t.string('einstufung', 20).notNullable();
    t.string('grund', 120);
    t.string('status', 20).notNullable().defaultTo('offen'); // offen|uebernommen|verworfen
    t.integer('entschieden_von');
    t.timestamp('entschieden_am');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'status', 'einstufung']);
    t.unique(['tenant_id', 'subjekt_typ', 'subjekt_id', 'herkunft', 'status']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('adresse_vorschlag');
  await knex.schema.alterTable('vendor_profiles', (t) => {
    t.dropColumn('strasse'); t.dropColumn('hausnummer'); t.dropColumn('adresszusatz');
    t.dropColumn('plz'); t.dropColumn('ort'); t.dropColumn('land');
    t.dropColumn('adresse_quelle'); t.dropColumn('adresse_am'); t.dropColumn('adresse_roh');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'plz']);
    t.dropColumn('strasse'); t.dropColumn('hausnummer'); t.dropColumn('adresszusatz');
    t.dropColumn('plz'); t.dropColumn('adresse_ort'); t.dropColumn('adresse_land');
    t.dropColumn('adresse_quelle'); t.dropColumn('adresse_am'); t.dropColumn('adresse_roh');
  });
};
