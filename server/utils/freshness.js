/**
 * Profil-Frische-Score (0–100), dynamisch berechnet (nie gespeichert → nie stale).
 * Gewichte: Verfügbarkeit 50 %, Tagessatz 25 %, CV 25 %.
 * Ampel: >=70 grün, >=40 gelb, sonst rot.
 * Abgeleiteter Status: Verfügbarkeit älter als 21 Tage → "nicht bestätigt"
 * (14 Tage Loop + 7 Tage Reaktionsfrist).
 */
const DAY = 24 * 60 * 60 * 1000;

const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null);

function partScore(days, fresh, ok) {
  if (days === null) return 0;
  if (days <= fresh) return 100;
  if (days <= ok) return 60;
  if (days <= ok * 2) return 30;
  return 0;
}

function freshness({ availabilityConfirmedAt, rateCreatedAt, cvUploadedAt }) {
  const a = partScore(daysSince(availabilityConfirmedAt), 14, 30);
  const r = partScore(daysSince(rateCreatedAt), 90, 180);
  const c = partScore(daysSince(cvUploadedAt), 180, 365);
  const score = Math.round(0.5 * a + 0.25 * r + 0.25 * c);
  return {
    score,
    ampel: score >= 70 ? 'gruen' : score >= 40 ? 'gelb' : 'rot',
    nichtBestaetigt: (daysSince(availabilityConfirmedAt) ?? Infinity) > 21,
  };
}

module.exports = { freshness, daysSince };
