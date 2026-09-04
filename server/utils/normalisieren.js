/**
 * v1.25.0 — Schlüssel für die Zuordnung vorregistrierter Kontakte.
 *
 * Zwei Personen sind für uns dieselbe, wenn die E-Mail übereinstimmt, das
 * LinkedIn-Profil übereinstimmt oder der Name nach Bereinigung übereinstimmt.
 * Damit das über Excel-Listen, LinkedIn-Exporte und Selbstregistrierungen hinweg
 * funktioniert, müssen alle drei Werte in einer einheitlichen Form vorliegen.
 */

/** Akademische Grade und Zusätze, die vor keinem Namen stehen bleiben sollen. */
const TITEL = [
  'dr', 'drs', 'prof', 'professor', 'dipl', 'ing', 'dipl-ing', 'dipl-kfm', 'dipl-kffr',
  'dipl-oec', 'dipl-betriebswirt', 'dipl-inform', 'mba', 'msc', 'ma', 'bsc', 'ba', 'llm',
  'phd', 'mag', 'med', 'rer', 'nat', 'oec', 'habil', 'hc', 'em', 'univ', 'cfa', 'cpa', 'mbe',
];

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', ø: 'oe', å: 'aa' };

/** Umlaute ausschreiben, Akzente entfernen, alles klein. */
function entschaerfen(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[äöüßæøå]/g, (c) => UMLAUTE[c] || c)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // Akzente wie é, ç, ñ
    .replace(/['’`]/g, '');
}

/** Ein Namensteil: Titel raus, nur Buchstaben, Ziffern und Bindestrich behalten. */
function namensteil(text) {
  const woerter = entschaerfen(text)
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Bindestriche am Rand abziehen, sonst rutscht "Dipl.-Ing." als "-ing" durch
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w && !TITEL.includes(w))
    // Einzelbuchstaben sind Initialen oder Reste von Kürzeln wie "h.c.".
    // "Hans H. Meier" und "Hans Meier" sollen denselben Schlüssel ergeben.
    .filter((w) => w.length > 1);
  return woerter.join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Namensschlüssel im Format "vorname|nachname".
 * Leer, wenn nach der Bereinigung nichts Verwertbares übrig bleibt. Ein leerer
 * Schlüssel darf nie als Treffer gelten.
 */
function nameKey(vorname, nachname) {
  const v = namensteil(vorname);
  const n = namensteil(nachname);
  if (!v || !n) return null;
  return `${v}|${n}`;
}

/**
 * LinkedIn-URL vereinheitlichen: klein, ohne Protokoll- und Länderpräfix, ohne
 * Parameter, ohne Schrägstrich am Ende, Prozent-Kodierung aufgelöst.
 * Aus "https://DE.linkedin.com/in/Max-M%C3%BCller-123/?originalSubdomain=de"
 * wird "linkedin.com/in/max-mueller-123".
 */
function linkedinKey(url) {
  let roh = String(url || '').trim();
  if (!roh) return null;
  try { roh = decodeURIComponent(roh); } catch { /* kaputte Kodierung: Rohform behalten */ }
  roh = roh.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^[a-z]{2,3}\.linkedin\.com/, 'linkedin.com')
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+$/, '');
  if (!roh.includes('linkedin.com/')) return null;
  const key = entschaerfen(roh);
  return key.length > 5 ? key : null;
}

/** E-Mail einheitlich klein und ohne Rand, passend zu Migration 0027. */
function emailKey(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.includes('@') ? e : null;
}

module.exports = { nameKey, linkedinKey, emailKey, namensteil, entschaerfen };
