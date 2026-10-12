/**
 * v1.42.0 — Aus einem Anfragetext ein Projekt lesen.
 *
 * Zwei Stufen, und die Reihenfolge ist Absicht.
 *
 * Zuerst Regeln: Referenznummern, Datumsangaben, Prozentzahlen und Dauern
 * stehen in fast jeder Anfrage in erkennbarer Form, und ein regulärer
 * Ausdruck liest "17.10.2026" zuverlässiger als jedes Sprachmodell. Was die
 * Regeln sicher finden, bleibt stehen.
 *
 * Danach das Sprachmodell für das, was Regeln nicht können: Worum geht es,
 * was sind die Anforderungen, was ist Pflicht und was wäre schön. Das ist
 * Bedeutung, und dafür ist es da.
 *
 * Was keine der beiden Stufen findet, bleibt leer und wird als Lücke
 * gemeldet. Eine Anfrage ohne Tagessatz ist der Normalfall, und eine
 * erfundene Zahl wäre deutlich schlimmer als ein leeres Feld: Sie sieht aus
 * wie eine Information.
 */
const { getLlmProvider } = require('../providers/llm');

/* ------------------------------- Regeln ---------------------------------- */

/** Referenznummer. Jeder Vermittler nennt sie anders, gemeint ist dasselbe. */
function leseReferenz(text) {
  const muster = [
    /\b(?:request|referenz|ref)[-\s.]*(?:nr|nummer|no)?\.?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,20})/i,
    /\bjob[-\s]?(?:nummer|nr|id)\.?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,20})/i,
    /\bprojekt[-\s]?(?:nummer|nr|id)\.?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,20})/i,
  ];
  for (const m of muster) {
    const t = text.match(m);
    if (t?.[1]) return t[1].trim();
  }
  return null;
}

/** Datum in deutscher Schreibweise oder ISO, als YYYY-MM-DD. */
function alsDatum(wert) {
  const s = String(wert || '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

function leseStart(text) {
  const m = text.match(/\b(?:start(?:datum)?|beginn|ab)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (m) return alsDatum(m[1]);
  // "ab sofort" ist eine Angabe, nur eben keine, die ein Datum ergibt.
  if (/\bab\s+sofort\b/i.test(text)) return null;
  return null;
}

/**
 * Dauer, als Text und nicht als Zahl.
 *
 * "1J" heißt ein Jahr, "6 bis 9 Monate" ist eine Spanne, "zunächst 3 Monate
 * mit Option" ist beides und noch ein Vorbehalt. In eine Zahl gepresst geht
 * genau das verloren, was die Verhandlung ausmacht.
 */
function leseDauer(text) {
  const m = text.match(/\bdauer\s*:?\s*([^\n]{1,60})/i);
  if (m) {
    const roh = m[1].trim().replace(/\s+/g, ' ');
    const kurz = roh.match(/^(\d+)\s*J\b/i);
    if (kurz) return `${kurz[1]} ${kurz[1] === '1' ? 'Jahr' : 'Jahre'}`;
    const monate = roh.match(/^(\d+)\s*M\b/i);
    if (monate) return `${monate[1]} Monate`;
    return roh;
  }
  const frei = text.match(/\b(\d+\s*(?:bis|-)\s*\d+\s*Monate?|\d+\s*Monate?|\d+\s*Jahre?)\b/i);
  return frei ? frei[1].replace(/\s+/g, ' ') : null;
}

function leseAuslastung(text) {
  const m = text.match(/\bauslastung\s*:?\s*([^\n]{1,40})/i);
  if (m) return m[1].trim();
  const prozent = text.match(/\b(\d{2,3})\s*%/);
  if (prozent) return `${prozent[1]} %`;
  const tage = text.match(/\b(\d)\s*Tage?\s*(?:pro|\/)\s*Woche\b/i);
  return tage ? `${tage[1]} Tage pro Woche` : null;
}

/** Arbeitsmodell aus dem Einsatzort ableiten, soweit das eindeutig geht. */
function leseArbeitsmodell(text) {
  const ort = text.match(/\b(?:einsatzort|ort|standort)\s*:?\s*([^\n]{1,80})/i)?.[1] || '';
  const beide = `${ort} ${text.slice(0, 2000)}`;
  if (/\b(100\s*%\s*remote|vollst[äa]ndig remote|rein remote)\b/i.test(beide)) return 'remote';
  if (/\bhybrid\b/i.test(beide)) return 'hybrid';
  if (/\bremote\b/i.test(ort)) return 'remote';
  if (/\bvor\s*ort\b/i.test(beide)) return 'vor_ort';
  return null;
}

function leseOrt(text) {
  const m = text.match(/\b(?:einsatzort|standort)\s*:?\s*([^\n]{1,80})/i);
  if (!m) return null;
  const o = m[1].trim();
  // "Remote" ist kein Ort, das ist ein Arbeitsmodell.
  return /^(remote|homeoffice|deutschlandweit|bundesweit)$/i.test(o) ? null : o || null;
}

/** Tagessatz, falls genannt. Meist ist er es nicht. */
function leseTagessatz(text) {
  const m = text.match(/\b(?:tagessatz|stundensatz|rate|budget)\s*:?\s*(?:bis\s*)?(?:ca\.?\s*)?(EUR|€)?\s*([\d.]{2,7})\s*(EUR|€)?/i);
  if (!m) return null;
  const roh = m[2];
  const zahl = Number(roh.replace(/\./g, ''));
  const mitWaehrung = Boolean(m[1] || m[3]);

  // Unter 100 ist ein Stundensatz oder gar nichts, über 10.000 kein Tagessatz.
  if (zahl < 100 || zahl > 10000) return null;

  // "Budget 2026" ist eine Jahreszahl, kein Satz. Vier Ziffern ohne Punkt und
  // ohne Währung im Bereich eines Kalenderjahres sind zu zweideutig, um sie
  // als Geldbetrag zu übernehmen: Ein falscher Tagessatz ist schlimmer als
  // ein leeres Feld, weil er aussieht wie eine Information.
  const sieht_aus_wie_jahr = /^\d{4}$/.test(roh) && zahl >= 1990 && zahl <= 2100;
  if (sieht_aus_wie_jahr && !mitWaehrung) return null;

  return zahl;
}

/**
 * Anforderungen aus Aufzählungen, als Vorarbeit und Gegenprobe zum Modell.
 *
 * Erkannt werden die üblichen Marker: Must-have, Nice-to-have, Voraussetzung,
 * Ihr Profil. Zeilen beginnen mit +, -, • oder *.
 */
function leseAnforderungen(text) {
  const must = []; const nice = [];
  let ziel = null;

  for (const roh of text.split('\n')) {
    const z = roh.trim();
    if (/^(must[-\s]?haves?|pflicht|voraussetzungen?|anforderungen|ihr profil)\b/i.test(z)) { ziel = must; continue; }
    if (/^(nice[-\s]?to[-\s]?haves?|w[üu]nschenswert|von vorteil|optional)\b/i.test(z)) { ziel = nice; continue; }
    if (/^(aufgaben|projektbeschreibung|rahmenbedingungen|wir bieten|[üu]ber uns)\b/i.test(z)) { ziel = null; continue; }
    if (!ziel) continue;

    const punkt = z.match(/^[+\-•*·]\s*(.+)$/);
    if (punkt && punkt[1].trim().length > 2) ziel.push(punkt[1].trim());
    else if (!z) ziel = ziel; // Leerzeile beendet den Block nicht, Absätze kommen vor
  }
  return { must, nice };
}

/**
 * Titel und Aufgabe, wo sie beschriftet sind.
 *
 * Lohnt die paar Zeilen, weil damit auch ohne Sprachmodell ein brauchbarer
 * Entwurf entsteht. Fällt das Modell aus, steht trotzdem etwas Lesbares da.
 */
function leseTitel(text) {
  // Zeilenanfang und Doppelpunkt sind Pflicht. Ohne beides traf das Muster
  // "Über Ihre Projektanfrage würde ich mich freuen" und machte daraus den
  // Projekttitel.
  const m = text.match(/^[ \t]*(?:projekttitel|projektbezeichnung|projekt|position|rolle|stelle|titel)[ \t]*:[ \t]*(.{3,120})$/im);
  return m ? m[1].trim() : null;
}

function leseAufgabe(text) {
  const m = text.match(/\b(?:aufgabenbeschreibung|aufgaben|projektbeschreibung|t[äa]tigkeit)\s*:?\s*\n+([\s\S]{10,1200}?)(?=\n\s*(?:must[-\s]?have|nice[-\s]?to|anforderung|voraussetzung|ihr profil|rahmenbedingung|wir bieten)|$)/i);
  if (!m) return null;
  return m[1].split('\n').map((z) => z.trim()).filter(Boolean).join(' ').slice(0, 1200) || null;
}

/** Der Absender steht fast immer in der Grußformel. */
function leseAbsender(text) {
  const m = text.match(/\b(?:mit freundlichen gr[üu][ßs]en|viele gr[üu][ßs]e|beste gr[üu][ßs]e|freundliche gr[üu][ßs]e)\s*[,.]?\s*\n+([^\n]{2,80})/i);
  const name = m ? m[1].trim().replace(/[,;]$/, '') : null;
  const mail = text.match(/\b([\w.+-]+@[\w-]+\.[\w.-]{2,})\b/)?.[1] || null;
  return { name: name && !/^(i\.a\.|i\.v\.)$/i.test(name) ? name : null, email: mail };
}

/** Alles, was ohne Modell geht. */
function leseMitRegeln(text) {
  const { must, nice } = leseAnforderungen(text);
  const absender = leseAbsender(text);
  return {
    titel: leseTitel(text),
    beschreibung: leseAufgabe(text),
    absender_name: absender.name,
    absender_email: absender.email,
    referenz: leseReferenz(text),
    start: leseStart(text),
    dauer: leseDauer(text),
    auslastung: leseAuslastung(text),
    arbeitsmodell: leseArbeitsmodell(text),
    ort: leseOrt(text),
    tagessatz_bis_eur: leseTagessatz(text),
    must, nice,
  };
}

/* ----------------------------- Sprachmodell ------------------------------- */

const ANFRAGE_PROMPT = `Du liest Projektanfragen für ein deutsches Expertennetzwerk
(Interim Manager, Berater, Projektleiter). Die Anfragen kommen von Personaldienstleistern,
Beratungen oder direkt von Unternehmen und sind nie gleich aufgebaut.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Schema:
{
  "titel": string|null,
  "beschreibung": string|null,
  "absender_firma": string|null,
  "absender_name": string|null,
  "ort": string|null,
  "arbeitsmodell": "remote"|"hybrid"|"vor_ort"|null,
  "start": string|null,
  "dauer": string|null,
  "auslastung": string|null,
  "tagessatz_bis_eur": number|null,
  "must": [string],
  "nice": [string],
  "skills": [string],
  "branche": string|null
}

Regeln:
- Erfinde nichts. Was nicht dasteht, ist null oder eine leere Liste.
- Besonders nicht den Tagessatz: Die meisten Anfragen nennen keinen.
- "start" als YYYY-MM-DD, sonst null.
- "dauer" und "auslastung" als Text übernehmen, nicht umrechnen.
- "must" sind zwingende Anforderungen, "nice" das Wünschenswerte. Wenn die
  Anfrage nicht trennt, gehört alles in "must".
- "skills" sind 5 bis 15 kurze, suchbare Begriffe (z.B. "WP-Examen",
  "Bankenaufsicht", "Teamleitung"), abgeleitet aus Aufgabe und Anforderungen.
- "titel" ist die Rolle, nicht der Werbetext der Firma.
Kein Text vor oder nach dem JSON.`;

/** Das Modell fragen und die Antwort als Objekt zurückgeben. */
async function leseMitModell(text) {
  const llm = getLlmProvider();
  // Der vorhandene Anbieter spricht extract(text, prompts). Dieselbe Strecke,
  // anderer Auftrag: ein zweiter Weg zum Modell wäre ein zweiter Weg, der
  // anders kaputtgeht.
  const antwort = await llm.extract(text, { EXTRACT_PROMPT: ANFRAGE_PROMPT });
  return antwort && typeof antwort === 'object' ? antwort : {};
}

/* ------------------------------ Zusammenbau ------------------------------- */

const PFLICHT = ['titel', 'start', 'dauer', 'auslastung'];

/**
 * Eine Anfrage lesen.
 *
 * Regeln gewinnen bei allem, was sich eindeutig erkennen lässt. Das Modell
 * füllt den Rest. Was offen bleibt, wird gemeldet.
 */
async function lies(rohtext, { mitModell = true } = {}) {
  const text = String(rohtext || '');
  if (text.trim().length < 20) {
    return { felder: {}, luecken: ['Der Text ist zu kurz, um daraus eine Anfrage zu lesen'], leser: 'regeln' };
  }

  const r = leseMitRegeln(text);
  let m = {};
  let leser = 'regeln';

  if (mitModell) {
    try {
      m = await leseMitModell(text);
      leser = 'gemischt';
    } catch {
      // Das Modell ist nicht erreichbar oder antwortet Unsinn. Dann eben nur
      // Regeln: ein halb gelesener Entwurf ist besser als eine Fehlermeldung.
      leser = 'regeln';
    }
  }

  const nimm = (a, b) => (a !== null && a !== undefined && a !== '' ? a : (b ?? null));
  const liste = (a, b) => {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    // Doppelte zusammenführen, Reihenfolge der Regeln zuerst.
    const gesehen = new Set();
    return [...x, ...y].filter((e) => {
      const k = String(e).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k || gesehen.has(k)) return false;
      gesehen.add(k); return true;
    }).slice(0, 25);
  };

  const felder = {
    titel: nimm(r.titel, m.titel),
    beschreibung: nimm(m.beschreibung, r.beschreibung),
    absender_firma: m.absender_firma || null,
    absender_name: nimm(r.absender_name, m.absender_name),
    absender_email: r.absender_email || null,
    referenz: r.referenz || null,
    // Regeln zuerst: ein Datum liest ein regulärer Ausdruck zuverlässiger.
    start: nimm(r.start, alsDatum(m.start)),
    dauer: nimm(r.dauer, m.dauer),
    auslastung: nimm(r.auslastung, m.auslastung),
    arbeitsmodell: nimm(r.arbeitsmodell, m.arbeitsmodell),
    ort: nimm(r.ort, m.ort),
    tagessatz_bis_eur: nimm(r.tagessatz_bis_eur, m.tagessatz_bis_eur),
    must: liste(r.must, m.must),
    nice: liste(r.nice, m.nice),
    skills: Array.isArray(m.skills) ? m.skills.slice(0, 15) : [],
    branche: m.branche || null,
  };

  const luecken = [];
  for (const f of PFLICHT) if (!felder[f]) luecken.push(`${f} nicht erkannt`);
  if (!felder.tagessatz_bis_eur) luecken.push('kein Tagessatz genannt, bitte beim Absender erfragen');
  if (!felder.must.length) luecken.push('keine Anforderungen erkannt');
  if (!felder.skills.length) luecken.push('keine Suchbegriffe abgeleitet, das Matching bleibt dünn');

  return { felder, luecken, leser };
}

module.exports = {
  lies, leseMitRegeln, leseReferenz, leseStart, leseDauer, leseAuslastung,
  leseTitel, leseAufgabe, leseAbsender,
  leseArbeitsmodell, leseOrt, leseTagessatz, leseAnforderungen, alsDatum,
  ANFRAGE_PROMPT,
};
