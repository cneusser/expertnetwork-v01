/**
 * v1.49.0 — Was der Kunde mit einem Profil macht.
 *
 * Die Felder `reaktion`, `reaktion_am` und `reaktion_notiz` liegen seit
 * v1.43.0 an der Position, bisher ohne Weg, sie zu füllen. Jetzt kommt der
 * Weg, und drei Dinge dazu.
 *
 * Erstens die Absage. Sie darf nicht in dem Moment hinausgehen, in dem der
 * Kunde klickt: Zwischen seiner Entscheidung und der Nachricht an den
 * Kandidaten liegt ein Gespräch, das du vielleicht noch führst, und eine
 * Absage, die du nicht kommen sahst, ist schwer zurückzuholen. Deshalb ein
 * eigener Zeitpunkt für das Verschicken.
 *
 * Zweitens die Benachrichtigung an dich. Ein Kunde, der etwas tut und
 * niemanden erreicht, wartet, und du merkst es nicht.
 *
 * Drittens die Kennung des Vorgangs. Sie steht hier und nicht in der Mail,
 * damit ein weitergeleiteter Link nicht plötzlich jemand anderem gehört.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('vorlage_positionen', (t) => {
    // Die Absage an den Kandidaten: wann freigegeben, wann verschickt.
    t.timestamp('absage_freigegeben_am');
    t.timestamp('absage_verschickt_am');
    // Was der Kunde als Grund angegeben hat. Geht NICHT an den Kandidaten,
    // das ist eine Information für dich.
    t.text('absage_grund_kunde');
  });

  await knex.schema.alterTable('vorlagen', (t) => {
    // Wann der Kunde zuletzt etwas getan hat, für die Übersicht.
    t.timestamp('letzte_reaktion_am');
    // Ob du über Reaktionen informiert werden willst. Standard ja: Ein Kunde,
    // der reagiert und niemanden erreicht, wartet.
    t.boolean('benachrichtigen').notNullable().defaultTo(true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('vorlagen', (t) => {
    t.dropColumn('letzte_reaktion_am');
    t.dropColumn('benachrichtigen');
  });
  await knex.schema.alterTable('vorlage_positionen', (t) => {
    t.dropColumn('absage_freigegeben_am');
    t.dropColumn('absage_verschickt_am');
    t.dropColumn('absage_grund_kunde');
  });
};
