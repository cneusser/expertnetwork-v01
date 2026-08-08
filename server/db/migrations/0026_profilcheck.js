/**
 * v1.24.0 — Quartalsweise Profilpflege.
 * Merkt sich, wann der Experte zuletzt gefragt wurde, ob sein Profil noch stimmt.
 * Ohne diese Spalte wuerde der Job bei jedem Lauf erneut schreiben.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.timestamp('letzter_profilcheck_at');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => { t.dropColumn('letzter_profilcheck_at'); });
};
