/**
 * v1.26.0 — Ansprache-Cockpit.
 *
 * Die Ansprache läuft von Hand über LinkedIn. Was die Plattform dafür braucht,
 * ist nicht Automatik, sondern ein Gedächtnis: Wen habe ich angeschrieben, was
 * kam zurück, wer ist als Nächstes dran.
 *
 * vorreg_reaktion:     was zurückkam (offen | interesse | spaeter | absage | keine)
 * vorreg_reaktion_am:  wann es zurückkam
 * vorreg_wiedervorlage: Datum, an dem der Kontakt wieder auftauchen soll
 * vorreg_notiz:        eine Zeile Gedächtnisstütze, rein intern
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.string('vorreg_reaktion').notNullable().defaultTo('offen');
    t.timestamp('vorreg_reaktion_am');
    t.date('vorreg_wiedervorlage');
    t.string('vorreg_notiz', 500);
  });
  await knex.schema.alterTable('experts', (t) => {
    t.index(['tenant_id', 'vorreg_reaktion'], 'experts_tenant_reaktion_idx');
    t.index(['tenant_id', 'vorreg_wiedervorlage'], 'experts_tenant_wiedervorlage_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'vorreg_reaktion'], 'experts_tenant_reaktion_idx');
    t.dropIndex(['tenant_id', 'vorreg_wiedervorlage'], 'experts_tenant_wiedervorlage_idx');
  });
  await knex.schema.alterTable('experts', (t) => {
    ['vorreg_reaktion', 'vorreg_reaktion_am', 'vorreg_wiedervorlage', 'vorreg_notiz']
      .forEach((c) => t.dropColumn(c));
  });
};
