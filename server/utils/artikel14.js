/**
 * v1.36.0 — Die Frist aus Art. 14 Abs. 3 DSGVO im Blick behalten.
 *
 * Wer Daten nicht bei der betroffenen Person selbst erhebt, muss sie
 * informieren, und zwar innerhalb eines Monats. Bei uns ist diese Information
 * die persönliche Nachricht über LinkedIn, in der der Datenschutz-Baustein
 * steht. Die Frist läuft also je Kontakt ab dem Tag des Imports, und wer nicht
 * angeschrieben wurde, ist nicht informiert.
 *
 * Das stand bisher nur in einem Dokument. Ein Dokument rechnet aber nicht mit,
 * und 766 Kontakte mit einer Monatsfrist sind keine Sache, die man im Kopf
 * behält. Hier steht, wie viel Zeit bleibt und was das pro Arbeitstag bedeutet.
 *
 * Zwei Dinge sagt diese Datei bewusst nicht:
 *
 * Sie trifft keine Rechtsauskunft. Ob die Monatsfrist im Einzelfall genau so
 * läuft, ob eine Ausnahme nach Art. 14 Abs. 5 greift und was bei Überschreitung
 * gilt, gehört zum Anwalt und nicht in eine Programmdatei.
 *
 * Und sie löscht nichts von allein. Wenn die Zeit nicht reicht, ist das eine
 * Entscheidung, die ein Mensch trifft.
 */

const TAG = 24 * 60 * 60 * 1000;

/** Ein Monat ab Import, so wie Fristen üblicherweise gerechnet werden. */
function fristEnde(importiertAm) {
  if (!importiertAm) return null;
  const d = new Date(importiertAm);
  if (Number.isNaN(d.getTime())) return null;
  const ziel = new Date(d);
  ziel.setMonth(ziel.getMonth() + 1);
  return ziel;
}

const tageBis = (datum, jetzt = new Date()) =>
  (datum ? Math.ceil((new Date(datum).getTime() - jetzt.getTime()) / TAG) : null);

/** Arbeitstage zwischen heute und einem Datum, Wochenenden zählen nicht mit. */
function arbeitstageBis(datum, jetzt = new Date()) {
  const ende = new Date(datum);
  if (Number.isNaN(ende.getTime())) return 0;
  let tage = 0;
  const lauf = new Date(jetzt);
  lauf.setHours(0, 0, 0, 0);
  ende.setHours(0, 0, 0, 0);
  while (lauf < ende) {
    lauf.setDate(lauf.getDate() + 1);
    const wt = lauf.getDay();
    if (wt !== 0 && wt !== 6) tage += 1;
  }
  return tage;
}

/**
 * Lage aus einer Liste von Kontakten.
 *
 * Erwartet Datensätze mit `vorreg_importiert_am` und `vorreg_angeschrieben_am`.
 * Wer angeschrieben wurde, gilt als informiert und zählt nicht mehr mit.
 */
function lage(kontakte, { pensum = 25, jetzt = new Date() } = {}) {
  const offen = kontakte.filter((k) => !k.vorreg_angeschrieben_am && k.vorreg_importiert_am);
  const informiert = kontakte.filter((k) => k.vorreg_angeschrieben_am).length;

  const mitFrist = offen
    .map((k) => ({ ...k, frist: fristEnde(k.vorreg_importiert_am) }))
    .filter((k) => k.frist)
    .sort((a, b) => a.frist - b.frist);

  const abgelaufen = mitFrist.filter((k) => k.frist < jetzt);
  const laufend = mitFrist.filter((k) => k.frist >= jetzt);

  // Die nächste Frist bestimmt das Tempo, denn sie läuft zuerst ab.
  const naechste = laufend[0]?.frist || null;
  const letzte = laufend[laufend.length - 1]?.frist || null;
  const arbeitstage = naechste ? arbeitstageBis(naechste, jetzt) : 0;

  // Realistisch ist, was bis zur jeweiligen Frist erreichbar ist. Deshalb
  // nicht alle durch die nächste Frist teilen, sondern schauen, wie viele
  // bis zum spätesten Fristende zu schaffen wären.
  const arbeitstageGesamt = letzte ? arbeitstageBis(letzte, jetzt) : 0;
  const schaffbar = arbeitstageGesamt * pensum;

  let ampel = 'gruen';
  if (abgelaufen.length > 0) ampel = 'rot';
  else if (laufend.length > schaffbar) ampel = 'rot';
  else if (laufend.length > schaffbar * 0.75) ampel = 'gelb';

  return {
    gesamt: kontakte.length,
    informiert,
    offen: laufend.length,
    abgelaufen: abgelaufen.length,
    naechste_frist: naechste,
    letzte_frist: letzte,
    tage_bis_naechste: naechste ? tageBis(naechste, jetzt) : null,
    arbeitstage_bis_naechste: arbeitstage,
    arbeitstage_bis_letzte: arbeitstageGesamt,
    noetig_pro_arbeitstag: arbeitstageGesamt > 0 ? Math.ceil(laufend.length / arbeitstageGesamt) : laufend.length,
    schaffbar_mit_pensum: schaffbar,
    pensum,
    ampel,
    // Nach Priorität, weil die Entscheidung meist dort getroffen wird.
    nach_prio: ['A', 'B', 'C', null].map((p) => ({
      prio: p || 'ohne',
      offen: laufend.filter((k) => (k.vorreg_prio || null) === p).length,
      abgelaufen: abgelaufen.filter((k) => (k.vorreg_prio || null) === p).length,
    })).filter((z) => z.offen > 0 || z.abgelaufen > 0),
  };
}

module.exports = { fristEnde, tageBis, arbeitstageBis, lage };
