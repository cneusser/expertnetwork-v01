/** v1.6.0 — LinkedIn OIDC: Verknüpfung des LinkedIn-Kontos (sub) mit dem Benutzerkonto. */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('linkedin_sub').unique();
  });
};
exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => { t.dropColumn('linkedin_sub'); });
};
