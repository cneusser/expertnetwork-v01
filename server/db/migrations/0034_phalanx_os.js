/**
 * 0034 — Anbindung an Phalanx OS.
 *
 * Drei Dinge:
 *
 * 1. `users.phalanx_os_sub` verknüpft ein Konto hier mit einem Konto dort.
 *    Verknüpft wird über `sub` und nicht über die E-Mail, weil Adressen sich
 *    ändern und weil eine übernommene Adresse sonst ein fremdes Admin-Konto
 *    öffnen würde.
 *
 * 2. `experts.pool_contact_id` merkt sich, welcher CRM-Kontakt hinter einem
 *    Profil steht, damit der Abgleich beim zweiten Lauf nicht dasselbe noch
 *    einmal anlegt. `pool_gemeldet_am` hält fest, dass die Ankunft schon
 *    zurückgemeldet wurde.
 *
 * 3. `experts.werbeeinwilligung` ist die UWG-Sperre. Adressen, die aus einem
 *    LinkedIn-Import stammen, tragen keine Einwilligung nach § 7 UWG.
 *    Einzelkorrespondenz ist erlaubt, automatisierte Post nicht.
 *
 *    Der Standard ist `true`, und das ist eine bewusste Entscheidung gegen den
 *    ersten Reflex. Ein Standard von `false` klingt sicherer, sperrt aber jeden
 *    Weg aus, an dem eine Einwilligung tatsächlich vorliegt: die
 *    Selbstregistrierung, die angenommene Einladung, das von Hand angelegte
 *    Profil. Gesperrt gehören nicht alle, sondern genau die beiden Wege, auf
 *    denen Adressen ohne Einwilligung ins System kommen. Die setzen den Wert
 *    darum ausdrücklich auf `false`: der Pool-Abgleich und der Listenimport.
 *    Eine Sperre, die zu viel sperrt, wird irgendwann abgeschaltet, und dann
 *    schützt sie gar nichts mehr.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('phalanx_os_sub').unique();
  });

  await knex.schema.alterTable('experts', (t) => {
    t.string('pool_contact_id');
    t.timestamp('pool_gesehen_am');
    t.timestamp('pool_gemeldet_am');
    t.boolean('werbeeinwilligung').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('experts', (t) => {
    t.index(['tenant_id', 'pool_contact_id'], 'experts_tenant_poolid_idx');
  });


  await knex.schema.createTable('phalanx_sync_lauf', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('art').notNullable().defaultTo('lesen'); // lesen | melden
    t.string('ausloeser').notNullable().defaultTo('scheduler'); // scheduler | hand
    t.timestamp('gestartet_am').notNullable().defaultTo(knex.fn.now());
    t.timestamp('beendet_am');
    t.integer('gelesen').notNullable().defaultTo(0);
    t.integer('neu').notNullable().defaultTo(0);
    t.integer('angereichert').notNullable().defaultTo(0);
    t.integer('mehrdeutig').notNullable().defaultTo(0);
    t.integer('gemeldet').notNullable().defaultTo(0);
    t.integer('fehler').notNullable().defaultTo(0);
    t.text('fehlertext');
    t.jsonb('tags_json').notNullable().defaultTo('[]');
    t.timestamp('stand_bis'); // höchstes updated_at dieses Laufs, Basis fürs nächste Polling
    t.index(['tenant_id', 'gestartet_am']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('phalanx_sync_lauf');
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'pool_contact_id'], 'experts_tenant_poolid_idx');
  });
  await knex.schema.alterTable('experts', (t) => {
    ['pool_contact_id', 'pool_gesehen_am', 'pool_gemeldet_am', 'werbeeinwilligung']
      .forEach((c) => t.dropColumn(c));
  });
  await knex.schema.alterTable('users', (t) => { t.dropColumn('phalanx_os_sub'); });
};
