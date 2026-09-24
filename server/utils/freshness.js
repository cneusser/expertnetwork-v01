/**
 * Profil-Frische-Score (0–100), dynamisch berechnet (nie gespeichert → nie stale).
 * Gewichte: Verfügbarkeit 50 %, Tagessatz 25 %, CV 25 %.
 * Ampel: >=70 grün, >=40 gelb, sonst rot.
 *
 * v1.33.0 — "nicht bestätigt" hängt nicht mehr an einer starren Frist von 21
 * Tagen, sondern an derselben Regel, nach der auch die Erinnerung verschickt
 * wird (utils/verfuegbarkeit.js). Sonst liefen beide auseinander: Wer
 * "verfügbar ab 1.10." gemeldet hat, wird aus gutem Grund nicht gefragt, wäre
 * aber nach drei Wochen trotzdem als "nicht bestätigt" abgewertet worden und
 * damit aus "Verfügbar jetzt" verschwunden. Eine Angabe, die gilt, darf ein
 * Profil nicht schlechter machen.
 *
 * Die alte Aufrufform mit nur `availabilityConfirmedAt` funktioniert weiter,
 * dann greift wie bisher die 21-Tage-Regel. Wer den ganzen Datensatz übergibt,
 * bekommt die genauere Bewertung.
 */
const { naechsteNachfrage, angabeGiltNoch } = require('./verfuegbarkeit');

const DAY = 24 * 60 * 60 * 1000;

const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

function partScore(days, fresh, ok) {
  if (days === null) return 0;
  if (days <= fresh) return 100;
  if (days <= ok) return 60;
  if (days <= ok * 2) return 30;
  return 0;
}

function freshness({ availabilityConfirmedAt, rateCreatedAt, cvUploadedAt, availability = null }) {
  const alter = daysSince(availabilityConfirmedAt);

  // Für den Punktwert zählt das Alter der Bestätigung, aber gemessen an dem
  // Zeitpunkt, zu dem wir überhaupt wieder nachfragen. Eine Angabe, die noch
  // gilt, ist frisch, auch wenn sie schon Wochen alt ist.
  let a;
  if (availability) {
    const ziel = naechsteNachfrage(availability);
    const tageBisNachfrage = ziel ? Math.floor((ziel.getTime() - Date.now()) / DAY) : null;
    if (tageBisNachfrage === null) a = 0;
    else if (tageBisNachfrage >= 0) a = 100;      // gilt noch
    else a = partScore(-tageBisNachfrage, 0, 16); // überfällig, und zwar seit wann
  } else {
    a = partScore(alter, 14, 30);
  }

  const r = partScore(daysSince(rateCreatedAt), 90, 180);
  const c = partScore(daysSince(cvUploadedAt), 180, 365);
  const score = Math.round(0.5 * a + 0.25 * r + 0.25 * c);

  return {
    score,
    ampel: score >= 70 ? 'gruen' : score >= 40 ? 'gelb' : 'rot',
    nichtBestaetigt: availability
      ? !angabeGiltNoch(availability)
      : (alter ?? Infinity) > 21,
  };
}

module.exports = { freshness, daysSince };
