/**
 * v1.51.0 — Wurde der Link überhaupt geöffnet?
 *
 * "Verschickt vor drei Tagen, nie aufgerufen" ist etwas ganz anderes als
 * "zweimal gelesen, keine Reaktion". Im ersten Fall liegt die Mail im Spam
 * oder im falschen Postfach, im zweiten überlegt jemand noch. Zwei Lagen,
 * zwei Reaktionen, und bisher sahen beide gleich aus.
 *
 * Gezählt wird bewusst mager: wie oft, wann zuerst, wann zuletzt. Keine
 * IP-Adresse, kein Browserkennzeichen, keine Sitzung. Das wäre eine
 * Beobachtung des Kunden, und dafür haben wir weder Anlass noch Erlaubnis.
 * Für die Frage "hat er reingeschaut" reicht ein Zähler.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('vorlagen', (t) => {
    t.integer('aufrufe').notNullable().defaultTo(0);
    t.timestamp('erst_geoeffnet_am');
    t.timestamp('zuletzt_geoeffnet_am');
  });

  /**
   * Klicks auf Knöpfe, die aus dem System hinausführen.
   *
   * Eigene Tabelle statt einer Spalte, weil es mehr als einen solchen Knopf
   * geben wird und eine Spalte je Knopf irgendwann albern aussieht.
   */
  await knex.schema.createTable('klicks', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').references('tenants.id'); // null: niemand angemeldet
    t.string('was', 40).notNullable();   // termin | ...
    t.string('woher', 60);               // welche Seite, grob
    t.integer('user_id');                // nur wenn angemeldet
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['was', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('klicks');
  await knex.schema.alterTable('vorlagen', (t) => {
    t.dropColumn('aufrufe');
    t.dropColumn('erst_geoeffnet_am');
    t.dropColumn('zuletzt_geoeffnet_am');
  });
};
