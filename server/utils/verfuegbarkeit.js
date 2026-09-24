/**
 * v1.33.0 — Wann ist eine Verfügbarkeitsangabe wirklich überholt?
 *
 * Bis hierher galt eine einzige Regel: Bestätigung älter als 14 Tage, also
 * nachfragen. Was in der Angabe stand, wertete niemand aus. Ein Experte, der
 * "verfügbar ab 1.10." gemeldet hatte, bekam deshalb alle zwei Wochen dieselbe
 * Frage, obwohl seine Aussage unverändert galt und er nichts Neues sagen konnte.
 * Fünf identische Bestätigungen in einer Akte sind kein Pflegezustand, sondern
 * ein Konstruktionsfehler.
 *
 * Die neue Regel fragt nicht nach Kalender, sondern nach Aussagewert: Eine
 * Angabe ist so lange gültig, wie sie etwas über die Gegenwart aussagt.
 *
 *   ab_datum, Datum in der Zukunft
 *     Die Aussage steht und ändert sich bis dahin nicht. Wir fragen eine Woche
 *     vor dem Termin, denn dann wird die Frage interessant: bleibt es dabei?
 *
 *   ab_datum, Datum erreicht oder vorbei
 *     Die Aussage ist eingelöst und beantwortet die Gegenwart nicht mehr. Ob er
 *     jetzt wirklich frei ist, weiß nur er. Also fragen.
 *
 *   sofort, teilweise
 *     Sagt etwas über heute und altert entsprechend schnell. Vierzehn Tage.
 *
 *   ausgebucht
 *     Ändert sich selten und stimmt meist über Wochen. Dreißig Tage, sonst
 *     fragt man Menschen etwas, das sie gerade erst beantwortet haben.
 *
 * Über allem ein Deckel von 90 Tagen. Auch eine Angabe mit einem Datum weit in
 * der Zukunft darf nicht dazu führen, dass ein Profil ein Jahr lang unberührt
 * bleibt. Irgendwann ist eine Nachfrage einfach fällig.
 */
const TAG = 24 * 60 * 60 * 1000;

const FRIST_TAGE = { sofort: 14, teilweise: 14, ausgebucht: 30, ab_datum: 14 };
const VORLAUF_TAGE = 7;   // so lange vor dem genannten Datum fragen wir nach
const DECKEL_TAGE = 90;   // spätestens dann fragen wir auf jeden Fall

const alsDatum = (wert) => {
  if (!wert) return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Wann sollte die nächste Nachfrage frühestens raus?
 * Liefert ein Date, oder null wenn es gar keine Angabe gibt (dann sofort).
 */
function naechsteNachfrage(avail) {
  const bestaetigt = alsDatum(avail?.confirmed_at) || alsDatum(avail?.created_at);
  if (!avail || !bestaetigt) return null; // nie etwas gemeldet, also fällig

  const frist = FRIST_TAGE[avail.status] ?? 14;
  const nachFrist = new Date(bestaetigt.getTime() + frist * TAG);
  const deckel = new Date(bestaetigt.getTime() + DECKEL_TAGE * TAG);

  if (avail.status === 'ab_datum') {
    const ab = alsDatum(avail.ab_datum);
    if (ab) {
      const kurzDavor = new Date(ab.getTime() - VORLAUF_TAGE * TAG);
      // Erst der spätere der beiden Zeitpunkte, damit eine Angabe nicht schon
      // am Tag nach der Meldung wieder abgefragt wird, wenn das Datum nah ist.
      const ziel = kurzDavor > nachFrist ? kurzDavor : nachFrist;
      return ziel > deckel ? deckel : ziel;
    }
  }
  return nachFrist;
}

/** Ist eine Nachfrage fällig? */
function nachfrageFaellig(avail, jetzt = new Date()) {
  const ziel = naechsteNachfrage(avail);
  return !ziel || ziel <= jetzt;
}

/**
 * Gilt die Angabe im Sinne der Profilfrische noch?
 *
 * Wichtig, damit beides zusammenpasst: Wenn wir aus gutem Grund nicht nachfragen,
 * darf das Profil nicht gleichzeitig als "nicht bestätigt" abgewertet werden.
 * Sonst verschwindet jemand aus "Verfügbar jetzt", nur weil seine Angabe in
 * Ordnung ist. Die Reaktionsfrist von sieben Tagen bleibt wie bisher.
 */
function angabeGiltNoch(avail, jetzt = new Date()) {
  const ziel = naechsteNachfrage(avail);
  if (!ziel) return false;
  return new Date(ziel.getTime() + 7 * TAG) > jetzt;
}

/** Klartext für die Oberfläche. */
function fallgkeitText(avail) {
  const ziel = naechsteNachfrage(avail);
  if (!ziel) return 'Nachfrage fällig, es liegt noch keine Angabe vor';
  const tage = Math.ceil((ziel.getTime() - Date.now()) / TAG);
  if (tage <= 0) return 'Nachfrage fällig';
  if (tage === 1) return 'nächste Nachfrage morgen';
  return `nächste Nachfrage in ${tage} Tagen`;
}

module.exports = {
  naechsteNachfrage, nachfrageFaellig, angabeGiltNoch, fallgkeitText,
  FRIST_TAGE, VORLAUF_TAGE, DECKEL_TAGE,
};
