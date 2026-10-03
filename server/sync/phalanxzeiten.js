/**
 * v1.40.0 — Tageslauf für die Stundenübergabe nach Phalanx OS.
 *
 * Stufe 3 des Auftrags. Was von Hand geht, geht jetzt auch von allein, und
 * zwar mit derselben Funktion: Ein zweiter Weg, der dasselbe anders macht,
 * ist ein zweiter Weg, der anders kaputtgeht.
 *
 * Der Lauf schickt nur, was sich seit der letzten Übergabe geändert hat.
 * Dass ein wiederholtes Senden drüben nichts verdoppelt, ist die Sicherung,
 * nicht der Normalfall.
 */
const { db } = require('../db/knex');
const { gleicheAb, eingerichtet } = require('../utils/phalanxZeiten');

async function laufAlleMandanten() {
  if (!eingerichtet()) return;

  const mandanten = await db('tenants').select('id', 'name');
  for (const t of mandanten) {
    try {
      const e = await gleicheAb({ db, tenantId: t.id });
      if (e.uebergeben || e.storniert || e.fehler || e.abgerechnet) {
        console.log(`[phalanx-zeiten] ${t.name}: ${e.geprueft} geprüft, ${e.uebergeben} übergeben, `
          + `${e.storniert} storniert, ${e.abgerechnet} drüben abgerechnet, ${e.fehler} Fehler`);
      }
    } catch (err) {
      // Ein Mandant mit Problemen darf die übrigen nicht aufhalten.
      console.error(`[phalanx-zeiten] ${t.name} fehlgeschlagen: ${err.message}`);
    }
  }
}

module.exports = { laufAlleMandanten };
