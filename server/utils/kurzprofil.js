/**
 * v1.43.0 — Das anonyme Kurzprofil.
 *
 * Was ein Kunde sehen soll, um über ein Gespräch zu entscheiden, und was er
 * nicht sehen soll, um nicht am Netzwerk vorbeigehen zu können.
 *
 * Gezeigt werden: Rolle, Jahre, Branchen, drei bis fünf Stationen ohne
 * Firmennamen, Schwerpunkte, Verfügbarkeit, Satz.
 * Nicht gezeigt werden: Name, Firma, Mail, Telefon, LinkedIn, Ort unterhalb
 * der Region, Namen von Arbeitgebern und Kunden.
 *
 * Firmennamen werden durch Umschreibungen ersetzt, nicht durch Lücken:
 * "Automobilzulieferer, rund 400 Mitarbeiter" sagt mehr als "[Firma]" und ist
 * trotzdem nicht rückverfolgbar.
 *
 * Erzeugt wird einmal. Danach gilt, was ein Mensch daraus gemacht hat: Ein
 * überarbeiteter Text ist besser als jeder neu erzeugte, und ihn beim
 * nächsten Lauf zu überschreiben wäre die sicherste Art, dass niemand mehr
 * etwas überarbeitet.
 */
const { getLlmProvider } = require('../providers/llm');

const KURZPROFIL_PROMPT = `Du schreibst anonyme Kurzprofile für ein deutsches Expertennetzwerk
(Interim Manager, Berater). Der Text geht an einen Kunden, der entscheiden soll, ob er ein
Gespräch führen will.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Schema:
{
  "rolle": string|null,
  "zusammenfassung": string,
  "stationen": [string],
  "schwerpunkte": [string]
}

Regeln:
- KEINE Namen von Personen, Arbeitgebern oder Kunden. Auch keine Produktnamen,
  aus denen sich die Firma ableiten lässt.
- Firmen werden umschrieben: "Automobilzulieferer, rund 400 Mitarbeiter",
  "börsennotierter Maschinenbauer", "Familienunternehmen im Handel".
- "zusammenfassung": 3 bis 4 Sätze, sachlich, was die Person kann und wofür
  sie steht. Keine Werbesprache, keine Superlative.
- "stationen": 3 bis 5 Zeilen, je "Rolle, umschriebene Firma, Zeitraum, ein
  konkretes Ergebnis". Nur was im Text steht.
- "schwerpunkte": 5 bis 8 kurze Begriffe.
- Erfinde nichts. Was nicht dasteht, lässt du weg.
Kein Text vor oder nach dem JSON.`;

/** Felder, die niemals in einem anonymen Profil stehen dürfen. */
function verboteneWerte(expert) {
  return [
    expert.vorname, expert.nachname, expert.firma, expert.email,
    expert.telefon, expert.mobil, expert.linkedin, expert.webseite,
  ].filter((w) => String(w || '').trim().length >= 3);
}

/**
 * Prüft einen fertigen Text gegen die Daten dieser Person.
 *
 * Gegen die echten Werte, nicht gegen eine erfundene Liste: Ein Sprachmodell
 * hält sich meistens an die Regel, und "meistens" ist bei einem Klarnamen in
 * einem Kundendokument zu wenig.
 */
function enthaeltKlardaten(text, expert) {
  const t = String(text || '').toLowerCase();
  const treffer = verboteneWerte(expert).filter((w) => t.includes(String(w).toLowerCase()));
  return treffer.length ? treffer : null;
}

/** Namen, die im Text stehen, durch eine neutrale Form ersetzen. */
function saeubere(text, expert) {
  let t = String(text || '');
  for (const w of verboteneWerte(expert)) {
    t = t.replace(new RegExp(escape(w), 'gi'), '');
  }
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

function escape(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ------------------------------ Erzeugen ---------------------------------- */

/** Die Rohdaten, aus denen ein Kurzprofil entsteht. */
async function quelle(db, expert) {
  const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
    .where('expert_id', expert.id).select('skills.name', 'skills.kategorie');
  const stationen = await db('career_steps').where({ expert_id: expert.id }).orderBy('id');
  const ausbildung = await db('educations').where({ expert_id: expert.id }).orderBy('id');

  const zeilen = [];
  if (expert.berufsbezeichnung) zeilen.push(`Rolle: ${expert.berufsbezeichnung}`);
  if (expert.kurzprofil) zeilen.push(`Kurzprofil: ${expert.kurzprofil}`);
  if (stationen.length) {
    zeilen.push('Stationen:');
    for (const s of stationen) {
      zeilen.push(`- ${[s.rolle, s.firma, s.zeitraum, s.ergebnis].filter(Boolean).join(', ')}`);
    }
  }
  if (ausbildung.length) {
    zeilen.push('Ausbildung:');
    for (const a of ausbildung) zeilen.push(`- ${[a.abschluss, a.institution, a.zeitraum].filter(Boolean).join(', ')}`);
  }
  if (skills.length) zeilen.push(`Kompetenzen: ${skills.map((s) => s.name).join(', ')}`);

  return { text: zeilen.join('\n'), skills, stationen };
}

/**
 * Ein Kurzprofil erzeugen.
 *
 * Ohne Sprachmodell entsteht trotzdem etwas: aus Rolle, Schwerpunkten und
 * Stationen zusammengesetzt. Nicht so flüssig, aber brauchbar, und es
 * blockiert niemanden, wenn das Modell gerade nicht erreichbar ist.
 */
async function erzeuge(db, expert, { mitModell = true } = {}) {
  const q = await quelle(db, expert);
  if (!q.text.trim()) {
    return { text: null, grund: 'Zu diesem Profil steht noch nichts da, aus dem sich etwas bauen ließe.' };
  }

  if (mitModell) {
    try {
      const llm = getLlmProvider();
      const a = await llm.extract(q.text, { EXTRACT_PROMPT: KURZPROFIL_PROMPT });
      const text = alsText(a);
      if (text) {
        const klar = enthaeltKlardaten(text, expert);
        // Das Modell hat sich nicht an die Regel gehalten. Dann nehmen wir
        // nicht den Text und putzen ihn, sondern bauen ihn selbst: Ein Text,
        // aus dem ein Name herausgeschnitten wurde, liest sich kaputt.
        if (!klar) return { text, grund: null, quelle: 'modell' };
      }
    } catch { /* unten weiter ohne Modell */ }
  }

  return { text: ausTeilen(expert, q), grund: null, quelle: 'regeln' };
}

function alsText(a) {
  if (!a || typeof a !== 'object') return null;
  const teile = [];
  if (a.zusammenfassung) teile.push(String(a.zusammenfassung).trim());
  if (Array.isArray(a.stationen) && a.stationen.length) {
    teile.push('', 'Stationen:', ...a.stationen.map((s) => `· ${String(s).trim()}`));
  }
  if (Array.isArray(a.schwerpunkte) && a.schwerpunkte.length) {
    teile.push('', `Schwerpunkte: ${a.schwerpunkte.join(' · ')}`);
  }
  return teile.length ? teile.join('\n') : null;
}

/** Die Fassung ohne Modell: zusammengesetzt aus dem, was gepflegt ist. */
function ausTeilen(expert, q) {
  const teile = [];
  if (expert.kurzprofil) teile.push(saeubere(expert.kurzprofil, expert));
  else if (expert.berufsbezeichnung) teile.push(`${expert.berufsbezeichnung} mit Erfahrung in ${q.skills.slice(0, 3).map((s) => s.name).join(', ') || 'mehreren Branchen'}.`);

  const branchen = q.skills.filter((s) => s.kategorie === 'branche').map((s) => s.name);
  if (branchen.length) teile.push(`Branchen: ${branchen.join(', ')}.`);

  if (q.stationen.length) {
    teile.push('', 'Stationen:');
    for (const s of q.stationen.slice(0, 5)) {
      // Die Firma fliegt raus, Rolle, Zeitraum und Ergebnis bleiben. Das
      // Ergebnis ist der eigentliche Wert einer Station.
      teile.push(`· ${[s.rolle, s.zeitraum, s.ergebnis].filter(Boolean).join(', ')}`);
    }
  }

  const schwerpunkte = q.skills.filter((s) => ['kompetenz', 'rolle'].includes(s.kategorie))
    .map((s) => s.name).slice(0, 8);
  if (schwerpunkte.length) teile.push('', `Schwerpunkte: ${schwerpunkte.join(' · ')}`);

  const text = teile.join('\n').trim();
  return text || null;
}

/**
 * Das Kurzprofil eines Experten holen und, falls es noch keines gibt, erzeugen.
 * Ein gepflegtes wird nie überschrieben.
 */
async function hole(db, expert, { neu = false } = {}) {
  if (expert.kurzprofil_anonym && !neu) return expert.kurzprofil_anonym;
  if (expert.kurzprofil_anonym_gepflegt && neu) {
    // Ausdrücklich neu erzeugen soll gehen, aber nicht aus Versehen.
    return expert.kurzprofil_anonym;
  }
  const { text } = await erzeuge(db, expert);
  if (text) {
    await db('experts').where({ id: expert.id })
      .update({ kurzprofil_anonym: text, kurzprofil_anonym_am: new Date() });
  }
  return text;
}

module.exports = {
  KURZPROFIL_PROMPT, erzeuge, hole, quelle,
  verboteneWerte, enthaeltKlardaten, saeubere, ausTeilen,
};
