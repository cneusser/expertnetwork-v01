/**
 * v1.40.0 — Das Kürzel, unter dem ein Experte in Phalanx OS erscheint.
 *
 * Drei Buchstaben aus dem Vornamen, drei aus dem Nachnamen: Martin Schumacher
 * wird MARSCH. Das ist für Menschen noch lesbar und trennt besser als bloße
 * Initialen, bei denen jeder zweite Maschinenbauer MS hieße.
 *
 * Nach drüben geht ausschließlich dieses Kürzel. Kein Name, keine Mailadresse,
 * kein Honorarsatz. Wer dahintersteht, steht in ExpertNetwork, und da gehört
 * es auch hin.
 *
 * Das Kürzel ist pseudonym, nicht anonym: Wer die Expertenliste kennt, kann
 * MARSCH zuordnen. Das ist beabsichtigt und auch nötig, sonst könnte in der
 * Projektakte niemand mehr sagen, wessen Stunden das sind. Es hält nur die
 * Klardaten aus einem System heraus, in dem sie nichts zu suchen haben.
 *
 * Einmal vergeben, bleibt es. Auch bei Namenswechsel: Drüben hängen
 * Zeiteinträge daran.
 */

/** Umlaute und Akzente auf Grundbuchstaben, alles andere raus. */
function nurBuchstaben(wert) {
  return String(wert || '')
    .replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

/**
 * Der Vorschlag ohne Rücksicht darauf, ob er schon vergeben ist.
 *
 * Kurze Namen werden nicht aufgefüllt. Ein Li Wu heißt LIWU, und das ist
 * richtig so: Ein künstlich verlängertes Kürzel wäre schwerer zu lesen und
 * nicht eindeutiger.
 */
function vorschlag(vorname, nachname) {
  const v = nurBuchstaben(vorname).slice(0, 3);
  const n = nurBuchstaben(nachname).slice(0, 3);
  const k = `${v}${n}`;
  // Wer weder im Vor- noch im Nachnamen einen lateinischen Buchstaben hat,
  // bekommt kein sprechendes Kürzel. Dann zählt nur noch die Eindeutigkeit.
  return k.length >= 2 ? k : 'EXP';
}

/**
 * Ein freies Kürzel finden. Bei Gleichstand wird durchnummeriert: MARSCH,
 * MARSCH2, MARSCH3. Keine Zufallszeichen, damit es vorlesbar bleibt.
 */
async function freiesKuerzel(db, tenantId, vorname, nachname) {
  const basis = vorschlag(vorname, nachname);
  for (let i = 1; i <= 99; i += 1) {
    const kandidat = i === 1 ? basis : `${basis}${i}`;
    const belegt = await db('experts')
      .where({ tenant_id: tenantId, phalanx_kuerzel: kandidat }).first();
    if (!belegt) return kandidat;
  }
  // Praktisch unerreichbar, aber eine Schleife ohne Ausgang ist keine Lösung.
  return `${basis}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Das Kürzel eines Experten holen und, falls es noch keines gibt, vergeben.
 *
 * Vorhandene Kürzel werden nie überschrieben, auch wenn der Name inzwischen
 * ein anderes ergeben würde.
 */
async function kuerzelFuer(db, experte) {
  if (experte.phalanx_kuerzel) return experte.phalanx_kuerzel;
  const k = await freiesKuerzel(db, experte.tenant_id, experte.vorname, experte.nachname);
  await db('experts').where({ id: experte.id }).update({ phalanx_kuerzel: k });
  return k;
}

module.exports = { nurBuchstaben, vorschlag, freiesKuerzel, kuerzelFuer };
