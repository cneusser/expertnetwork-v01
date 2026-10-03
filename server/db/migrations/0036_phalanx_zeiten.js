/**
 * v1.40.0 — Projektabgleich mit Phalanx OS, Stufe 2: die Stunden.
 *
 * Zwei Dinge kommen dazu.
 *
 * Erstens ein Kürzel am Experten. Nach Phalanx OS geht kein Klarname und
 * keine Mailadresse, nur dieses Kürzel. Es wird einmal vergeben und ändert
 * sich danach nie mehr, auch nicht bei Heirat oder Namenswechsel: Drüben
 * hängen Zeiteinträge daran, und ein Kürzel, das sich ändert, zerreißt die
 * Zuordnung still.
 *
 * Zweitens der Stand der Übergabe je Leistungsnachweis. Die Kennung selbst
 * braucht keine eigene Spalte, das ist die Zeilennummer: Sie steht fest,
 * solange die Zeile existiert, und genau daran hängt die Wiederholsicherheit
 * drüben.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.string('phalanx_kuerzel', 16).nullable();
    t.unique(['tenant_id', 'phalanx_kuerzel']);
  });

  await knex.schema.alterTable('timesheets', (t) => {
    t.timestamp('phalanx_gesendet_am').nullable();
    // Was zuletzt übergeben wurde. Damit erkennt der Tageslauf, ob sich
    // seither etwas geändert hat, ohne jedes Mal alles zu schicken.
    t.integer('phalanx_minuten').nullable();
    t.boolean('phalanx_storniert').notNullable().defaultTo(false);
    t.text('phalanx_fehler').nullable();
    t.index(['tenant_id', 'phalanx_gesendet_am']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('timesheets', (t) => {
    t.dropIndex(['tenant_id', 'phalanx_gesendet_am']);
    t.dropColumn('phalanx_gesendet_am');
    t.dropColumn('phalanx_minuten');
    t.dropColumn('phalanx_storniert');
    t.dropColumn('phalanx_fehler');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.dropUnique(['tenant_id', 'phalanx_kuerzel']);
    t.dropColumn('phalanx_kuerzel');
  });
};
