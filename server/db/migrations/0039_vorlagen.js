/**
 * v1.43.0 — Profile vorlegen, ohne Umweg über eine Freigabe.
 *
 * Bisher führte der Weg zum Kunden über `project_releases`, also über eine
 * Freigabe je Profil. Das war für Kunden mit Portalzugang gedacht und hieß
 * missverständlich: Freigegeben wurde nie ein Klarname, sondern ausgewählt,
 * wer vorgelegt wird. Für einen Vermittler, der nie ein Konto anlegt, war der
 * Weg schlicht falsch.
 *
 * Eine Vorlage ist jetzt das, was es im Geschäft auch ist: eine Auswahl von
 * Profilen zu einer Anfrage, mit Satz, Kurzfitting und einem Link, den man
 * verschicken kann. Sie gehört zum Projekt und nicht zum Kundenkonto, und sie
 * funktioniert mit und ohne Portal.
 *
 * Die Beträge stehen in Cent, wie überall im Haus.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('vorlagen', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('project_id').notNullable().references('projects.id');

    // An wen. Entweder ein Kunde mit Konto oder jemand, der nur eine Mail
    // bekommt. Beides muss gehen, ohne dass ein Konto entsteht.
    t.integer('vendor_user_id').references('users.id');
    t.string('empfaenger_firma', 200);
    t.string('empfaenger_name', 200);
    t.string('empfaenger_email', 200);

    t.string('token').notNullable().unique(); // der Weblink
    t.string('status', 20).notNullable().defaultTo('entwurf'); // entwurf | versendet | geschlossen

    // Der Aufschlag, mit dem diese Vorlage gerechnet wurde. Eingefroren:
    // Ändert sich der Satz am Empfänger später, bleibt die verschickte
    // Vorlage, wie sie verschickt wurde.
    t.integer('aufschlag_prozent').notNullable().defaultTo(20);

    t.text('anschreiben');
    t.timestamp('gueltig_bis');
    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('versendet_am');
    t.index(['tenant_id', 'status']);
    t.index(['project_id']);
  });

  await knex.schema.createTable('vorlage_positionen', (t) => {
    t.increments('id').primary();
    t.integer('vorlage_id').notNullable().references('vorlagen.id').onDelete('CASCADE');
    t.integer('expert_id').notNullable().references('experts.id');

    // "Profil A", "Profil B". Steht in der Tabelle und wird nicht beim
    // Anzeigen gezählt: Sonst heißt derselbe Mensch im PDF anders als im Web,
    // sobald jemand eine Position entfernt.
    t.string('kennung', 20).notNullable();

    // Was dem Empfänger gezeigt wird, eingefroren beim Erstellen. Ändert der
    // Experte danach sein Profil, ändert sich die verschickte Vorlage nicht.
    t.text('kurzprofil');
    t.text('fitting'); // ein bis zwei Sätze, warum dieses Profil zu dieser Anfrage passt
    t.jsonb('profil_json').defaultTo('{}');

    t.integer('satz_experte_cent');  // was der Experte nimmt, nur intern
    t.integer('satz_kunde_cent');    // mit Aufschlag, das sieht der Empfänger
    t.integer('sortierung').notNullable().defaultTo(0);

    // Was der Empfänger damit gemacht hat. Kommt in Etappe C zum Tragen,
    // steht aber schon hier, damit die Tabelle nicht zweimal wandert.
    t.string('reaktion', 20); // gemerkt | einladen | abgelehnt
    t.timestamp('reaktion_am');
    t.text('reaktion_notiz');

    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['vorlage_id', 'expert_id']);
    t.index(['vorlage_id', 'sortierung']);
  });

  await knex.schema.alterTable('experts', (t) => {
    // Das anonyme Kurzprofil. Einmal erzeugt, danach von Hand pflegbar und
    // nie still überschrieben: Ein Text, den jemand überarbeitet hat, ist
    // besser als jeder neu erzeugte.
    t.text('kurzprofil_anonym');
    t.timestamp('kurzprofil_anonym_am');
    t.boolean('kurzprofil_anonym_gepflegt').notNullable().defaultTo(false);
  });

  // Der Aufschlag je Empfänger. Bei SOLCOM einmal gesetzt, künftig gezogen.
  await knex.schema.alterTable('vendor_profiles', (t) => {
    t.integer('aufschlag_prozent');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('vendor_profiles', (t) => t.dropColumn('aufschlag_prozent'));
  await knex.schema.alterTable('experts', (t) => {
    t.dropColumn('kurzprofil_anonym');
    t.dropColumn('kurzprofil_anonym_am');
    t.dropColumn('kurzprofil_anonym_gepflegt');
  });
  await knex.schema.dropTableIfExists('vorlage_positionen');
  await knex.schema.dropTableIfExists('vorlagen');
};
