/** v0.4.2 — Kontaktprofil: Anrede (Herr/Frau/Divers) und Titel (Dr., Prof., …). */

exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.string('anrede'); // herr | frau | divers
    t.string('titel');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('anrede');
    t.dropColumn('titel');
  });
};
