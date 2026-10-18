/**
 * v1.48.0 — Aus einem Kontakt einen assoziierten Partner machen.
 *
 * Bei Chris Seifert fehlte der Weg: Er ist Corporate-Finance-Berater, kein
 * Interim Manager, und ins Kapitalpartner-Verzeichnis gehört er auch nicht,
 * denn das führt Finanzierer. Was er mitbringt, ist ein Netzwerk, und dafür
 * gibt es das Partnermodell.
 *
 * `expert_id` bleibt stehen, auch wenn der Kontakt später gelöscht wird: Die
 * Spalte ist nur ein Hinweis auf die Herkunft, kein Fremdschlüssel mit Zwang.
 * Ein Partner soll nicht verschwinden, weil jemand seinen alten
 * Expertendatensatz aufgeräumt hat.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('partner_applications', (t) => {
    t.integer('expert_id');
    t.string('firma', 200);
    t.string('linkedin', 250);
    t.string('quelle', 40).defaultTo('bewerbung'); // bewerbung | umgewandelt
    t.index(['tenant_id', 'expert_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('partner_applications', (t) => {
    t.dropIndex(['tenant_id', 'expert_id']);
    t.dropColumn('expert_id'); t.dropColumn('firma');
    t.dropColumn('linkedin'); t.dropColumn('quelle');
  });
};
