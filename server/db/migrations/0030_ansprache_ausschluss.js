/**
 * v1.26.1 — Kontakte aus der Ansprache herausnehmen.
 *
 * Nicht jeder im Netzwerk gehört in den Vermittlungspool. Eine Professorin ist
 * als fachliche Ressource wertvoll und wird trotzdem nie auf ein Interim-Mandat
 * gehen. Solche Leute sollen aus der Arbeitsliste verschwinden, ohne dass man
 * sie löschen muss, und sie dürfen beim nächsten Import nicht wieder auftauchen.
 *
 * Zwei Ebenen:
 *   experts.vorreg_ausgeschlossen_am  die Entscheidung am Datensatz, umkehrbar
 *   ansprache_ausschluss              eine schlanke Merkliste, die den Datensatz
 *                                     überdauert und künftige Importe filtert
 *
 * Die Merkliste enthält bewusst nur, was zum Wiedererkennen nötig ist, und dient
 * allein dazu, jemanden NICHT zu kontaktieren (Datenminimierung, Art. 5 DSGVO).
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.timestamp('vorreg_ausgeschlossen_am');
    t.string('vorreg_ausschluss_grund', 300);
  });

  await knex.schema.createTable('ansprache_ausschluss', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('anzeige_name').notNullable(); // nur zur Wiedererkennung in der Liste
    t.string('name_key');
    t.string('linkedin');
    t.string('email');
    t.string('grund', 300);
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'name_key'], 'ausschluss_tenant_namekey_idx');
    t.index(['tenant_id', 'linkedin'], 'ausschluss_tenant_linkedin_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ansprache_ausschluss');
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('vorreg_ausgeschlossen_am');
    t.dropColumn('vorreg_ausschluss_grund');
  });
};
