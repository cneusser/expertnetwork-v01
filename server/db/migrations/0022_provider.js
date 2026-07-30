/** v1.16.0 — Provider-Hub I: Dienstleister-Provider mit eigenem Profil (Freigabe-Gate). */
exports.up = async function up(knex) {
  await knex.schema.createTable('provider_profiles', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.string('firmenname').notNullable();
    t.string('ansprechpartner');
    t.string('telefon');
    t.string('webseite');
    t.jsonb('fokus_json').notNullable().defaultTo('[]'); // Branchen/Funktionen als Freitext-Tags
    t.integer('tagessatz_von');
    t.integer('tagessatz_bis');
    t.text('hauptprojekte'); // typische Projektarten, Freitext
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id']);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('provider_profiles');
};
