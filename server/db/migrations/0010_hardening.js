/**
 * v1.0.0 — Härtung: token_version für Session-Invalidierung.
 * Passwortänderung/-reset/Widerruf erhöhen die Version — alle bestehenden
 * Sessions (JWT-Cookies) des Kontos werden damit sofort ungültig.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.integer('token_version').notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => t.dropColumn('token_version'));
};
