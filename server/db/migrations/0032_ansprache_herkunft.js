/**
 * 0032 — Herkunft aus der Ansprache festhalten.
 *
 * Bisher erkannte die Auswertung einen Kontakt aus der Ansprache an
 * `vorreg_importiert_am`. Das trifft die vorbereiteten Kontakte, nicht aber die
 * eingeladenen: Die kamen über den Einladungs-Upload und haben von Anfang an
 * ein Konto. Die Arbeitsliste zählte beide Gruppen, die Auswertung nur eine.
 * Wer wie gewünscht ankam, verschwand deshalb aus dem Trichter, statt dort als
 * Erfolg zu erscheinen.
 *
 * Schlimmer noch: Sobald jemand ankommt, wechselt der Status. Eine Bedingung
 * auf den Status hätte das Problem also nur verschoben. Es braucht eine
 * Markierung, die den Statuswechsel überlebt, und genau die ist das hier.
 *
 * Der Backfill erfasst alle drei Wege, auf denen jemand in die Ansprache kam.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.timestamp('ansprache_seit');
  });
  await knex.schema.alterTable('experts', (t) => {
    t.index(['tenant_id', 'ansprache_seit'], 'experts_tenant_anspracheseit_idx');
  });

  await knex.raw(`
    UPDATE experts
       SET ansprache_seit = COALESCE(vorreg_importiert_am, invite_cycle_started_at, created_at)
     WHERE vorreg_importiert_am IS NOT NULL
        OR vorreg_angeschrieben_am IS NOT NULL
        OR status = 'eingeladen'
  `);
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('experts', (t) => {
    t.dropIndex(['tenant_id', 'ansprache_seit'], 'experts_tenant_anspracheseit_idx');
  });
  await knex.schema.alterTable('experts', (t) => { t.dropColumn('ansprache_seit'); });
};
