/**
 * v1.17.0 — Provider-Digest: anonymisierte Profilkarten fuer freigegebene
 * Provider, mit ausdruecklichem Opt-in des Experten (Consent-Erweiterung)
 * und Interesse-Funnel.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.boolean('provider_optin').notNullable().defaultTo(false);
    t.timestamp('provider_optin_at');
    t.timestamp('digest_included_at'); // Dedupe: schon einmal als "neu" im Digest
  });
  await knex.schema.createTable('provider_interest', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable();
    t.integer('provider_user_id').notNullable();
    t.integer('expert_id').notNullable();
    t.string('status').notNullable().defaultTo('neu'); // neu | in_klaerung | erledigt
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['provider_user_id', 'expert_id']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('provider_optin'); t.dropColumn('provider_optin_at'); t.dropColumn('digest_included_at');
  });
  await knex.schema.dropTableIfExists('provider_interest');
};
