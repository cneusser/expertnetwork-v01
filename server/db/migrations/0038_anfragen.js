/**
 * v1.42.0 — Projektanfragen einlesen.
 *
 * Anfragen kommen als Fließtext: als Rundmail eines Vermittlers, als PDF vom
 * Endkunden, als drei Zeilen aus einem Telefonat. Kein Format ist wie das
 * andere, und keines wird es je sein.
 *
 * Der Rohtext wird aufbewahrt, nicht nur das Extrahierte. Wenn in vier Wochen
 * jemand fragt, ob da wirklich "WP-Examen" stand oder ob die Maschine das
 * hinzugedichtet hat, soll die Antwort nachlesbar sein. Das ist auch der
 * Grund, warum die Anfrage eine eigene Tabelle bekommt statt eines Feldes am
 * Projekt: Nicht aus jeder Anfrage wird ein Projekt, und abgelehnte Anfragen
 * sind eine eigene Information.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('anfragen', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');

    // Was hereinkam, unverändert.
    t.text('rohtext').notNullable();
    t.string('eingang', 20).notNullable().defaultTo('eingefuegt'); // eingefuegt | datei
    t.string('dateiname', 255);

    // Wer fragt. Steht hier und nicht nur im Projekt, weil eine abgelehnte
    // Anfrage trotzdem zeigt, wer auf dich zukommt.
    t.string('absender_firma', 200);
    t.string('absender_name', 200);
    t.string('absender_email', 200);
    t.string('referenz', 80); // Request-Nr, Jobnummer, was der Vermittler vergibt

    // Das Ergebnis des Lesens, bevor jemand es bestätigt hat.
    t.jsonb('gelesen_json').defaultTo('{}');
    // Was nicht erkannt wurde. Eine Anfrage ohne Tagessatz ist normal, und
    // das Feld leer zu lassen ist ehrlicher, als eine Zahl zu erfinden.
    t.jsonb('luecken_json').defaultTo('[]');
    t.string('leser', 20); // llm | regeln | gemischt

    t.string('status', 20).notNullable().defaultTo('neu'); // neu | uebernommen | abgelehnt
    t.integer('project_id').references('projects.id');
    t.text('ablehnung_grund');

    t.integer('created_by');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('entschieden_am');
    t.index(['tenant_id', 'status']);
    // Dieselbe Rundmail kommt gern zweimal. Die Referenz des Absenders ist
    // der einzige verlässliche Anhaltspunkt dafür.
    t.index(['tenant_id', 'referenz']);
  });

  await knex.schema.alterTable('projects', (t) => {
    // Woher das Projekt stammt, und die Anforderungen so, wie sie dastanden.
    t.string('herkunft', 20).defaultTo('intern'); // intern | anfrage | kunde
    t.string('auslastung', 40);   // "100 %", "3 Tage pro Woche"
    t.string('dauer', 60);        // "1 Jahr", "6 bis 9 Monate"
    t.jsonb('must_json').defaultTo('[]');
    t.jsonb('nice_json').defaultTo('[]');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('projects', (t) => {
    t.dropColumn('herkunft'); t.dropColumn('auslastung'); t.dropColumn('dauer');
    t.dropColumn('must_json'); t.dropColumn('nice_json');
  });
  await knex.schema.dropTableIfExists('anfragen');
};
