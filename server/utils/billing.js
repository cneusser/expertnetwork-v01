/**
 * v1.23.0 — Rechenkern der Abrechnung.
 *
 * Zwei Belege je Leistungsnachweis:
 *  Gutschrift an den Interimer  = Tage x Einkaufssatz + Spesen (durchlaufend)
 *  Rechnung an den Kunden       = Tage x Verkaufssatz + Spesen (+ einmalige Erfolgsgebuehr)
 *
 * Gebuehrenmodelle (aus dem Projekt, v1.1.0):
 *  gu_anteil: wir treten als Generalunternehmer auf, der Verkaufssatz liegt um
 *             den Prozentsatz ueber dem Einkaufssatz. Die Marge ist der Aufschlag.
 *  erfolg:    der Satz wird durchgereicht, wir stellen einmalig ein Erfolgshonorar
 *             auf das geplante Mandatsvolumen (Einkaufssatz x Plantage).
 *
 * Alles rechnet in Cent, gerundet wird erst am Ende jeder Position.
 */
const { db } = require('../db/knex');

const cent = (eur) => Math.round(Number(eur || 0) * 100);
const eur = (c) => (Number(c || 0) / 100);

/** Verkaufssatz in Cent, entweder gesetzt oder aus dem Gebuehrenmodell abgeleitet. */
function verkaufssatzCent(engagement) {
  if (engagement.tagessatz_kunde_eur) return cent(engagement.tagessatz_kunde_eur);
  const ein = cent(engagement.tagessatz_experte_eur);
  if (engagement.gebuehr_modell === 'gu_anteil') {
    return Math.round(ein * (1 + Number(engagement.gebuehr_prozent || 0) / 100));
  }
  return ein; // erfolg: Satz wird durchgereicht
}

/** Einmaliges Erfolgshonorar in Cent (nur Modell "erfolg", nur beim ersten Beleg). */
function erfolgshonorarCent(engagement) {
  if (engagement.gebuehr_modell !== 'erfolg') return 0;
  const volumen = cent(engagement.tagessatz_experte_eur) * Number(engagement.plan_tage || 0);
  return Math.round((volumen * Number(engagement.gebuehr_prozent || 0)) / 100);
}

function summe(positionen, ustProzent) {
  const netto = positionen.reduce((s, p) => s + p.betrag_cent, 0);
  const ust = Math.round((netto * Number(ustProzent || 0)) / 100);
  return { netto_cent: netto, ust_cent: ust, brutto_cent: netto + ust };
}

/**
 * Beide Belege zu einem Leistungsnachweis vorrechnen, ohne etwas zu speichern.
 * ersteRechnung steuert, ob das Erfolgshonorar mitlaeuft.
 */
function berechne(engagement, timesheet, { ersteRechnung = false } = {}) {
  const tage = Number(timesheet.tage || 0);
  const spesen = cent(timesheet.spesen_eur);
  const ust = Number(engagement.ust_prozent ?? 19);
  const label = `Leistungszeitraum ${timesheet.periode}`;

  const einkauf = cent(engagement.tagessatz_experte_eur);
  const gutschriftPos = [
    { text: `Beratungstage ${label}`, menge: tage, einzel_cent: einkauf, betrag_cent: Math.round(einkauf * tage) },
  ];
  if (spesen) gutschriftPos.push({ text: 'Weiterberechnete Spesen', menge: 1, einzel_cent: spesen, betrag_cent: spesen });

  const verkauf = verkaufssatzCent(engagement);
  const rechnungPos = [
    { text: `Interim Management ${label}`, menge: tage, einzel_cent: verkauf, betrag_cent: Math.round(verkauf * tage) },
  ];
  if (spesen) rechnungPos.push({ text: 'Weiterberechnete Spesen', menge: 1, einzel_cent: spesen, betrag_cent: spesen });
  const erfolg = ersteRechnung ? erfolgshonorarCent(engagement) : 0;
  if (erfolg) {
    rechnungPos.push({
      text: `Vermittlungshonorar ${engagement.gebuehr_prozent} Prozent auf das geplante Mandatsvolumen`,
      menge: 1, einzel_cent: erfolg, betrag_cent: erfolg,
    });
  }

  const gutschrift = { typ: 'gutschrift', positionen: gutschriftPos, ust_prozent: ust, ...summe(gutschriftPos, ust) };
  const rechnung = { typ: 'rechnung', positionen: rechnungPos, ust_prozent: ust, ...summe(rechnungPos, ust) };
  return { gutschrift, rechnung, marge_cent: rechnung.netto_cent - gutschrift.netto_cent, verkaufssatz_cent: verkauf };
}

/** Fortlaufende Belegnummer je Mandant, Typ und Jahr: GS-2026-0001 bzw. RE-2026-0001. */
async function naechsteBelegNr(tenantId, typ, jahr, trx = db) {
  const prefix = typ === 'gutschrift' ? 'GS' : 'RE';
  const start = `${prefix}-${jahr}-`;
  const letzte = await trx('invoices')
    .where({ tenant_id: tenantId, typ })
    .andWhere('beleg_nr', 'like', `${start}%`)
    .orderBy('beleg_nr', 'desc').first();
  const lfd = letzte ? Number(String(letzte.beleg_nr).split('-').pop()) + 1 : 1;
  return `${start}${String(lfd).padStart(4, '0')}`;
}

module.exports = { berechne, verkaufssatzCent, erfolgshonorarCent, naechsteBelegNr, cent, eur };
