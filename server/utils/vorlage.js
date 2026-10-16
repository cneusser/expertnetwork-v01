/**
 * v1.43.0 — Eine Vorlage bauen: Auswahl, Satz, Kurzfitting.
 *
 * Alles, was der Empfänger später sieht, wird beim Erstellen eingefroren.
 * Ändert ein Experte danach sein Profil oder seinen Satz, ändert sich die
 * verschickte Vorlage nicht. Eine Unterlage, die sich nachträglich wandelt,
 * ist keine Unterlage, und bei einem Tagessatz wäre das ein echtes Problem.
 */
const crypto = require('crypto');
const { getLlmProvider } = require('../providers/llm');
const { hole: holeKurzprofil, enthaeltKlardaten } = require('./kurzprofil');

const STANDARD_AUFSCHLAG = 20;

/** Kennungen in der Reihenfolge der Auswahl: Profil A, Profil B, ... */
function kennungFuer(index) {
  if (index < 26) return `Profil ${String.fromCharCode(65 + index)}`;
  return `Profil ${index + 1}`;
}

/**
 * Der Aufschlag für einen Empfänger.
 *
 * Am Kunden gepflegt gewinnt, sonst der Hausstandard. Beim Erstellen jeder
 * Vorlage überschreibbar, und der dann verwendete Wert wird mitgespeichert.
 */
async function aufschlagFuer(db, { vendorUserId = null, ueberschreiben = null }) {
  if (ueberschreiben !== null && ueberschreiben !== undefined) return Number(ueberschreiben);
  if (vendorUserId) {
    const v = await db('vendor_profiles').where({ user_id: vendorUserId }).first();
    if (v?.aufschlag_prozent !== null && v?.aufschlag_prozent !== undefined) return Number(v.aufschlag_prozent);
  }
  return STANDARD_AUFSCHLAG;
}

/** Verkaufssatz aus Einkaufssatz und Aufschlag, in Cent. */
function satzMitAufschlag(einkaufCent, prozent) {
  if (!einkaufCent) return null;
  return Math.round(Number(einkaufCent) * (1 + Number(prozent || 0) / 100));
}

/**
 * Der jüngste Tagessatz eines Experten, in Cent.
 *
 * `rates` führt Spannen (satz_von_eur bis satz_bis_eur) je Kategorie. Für
 * eine Vorlage nehmen wir die Untergrenze: Was oben noch geht, ist
 * Verhandlungssache, und eine Vorlage, die zu hoch einsteigt, wird gar nicht
 * erst beantwortet.
 *
 * Passt die Kategorie zum Arbeitsmodell des Projekts, gewinnt sie. Sonst der
 * jüngste Satz überhaupt.
 */
async function satzVon(db, expertId, { kategorie = null } = {}) {
  const alle = await db('rates').where({ expert_id: expertId }).orderBy('created_at', 'desc');
  if (!alle.length) return null;
  const passend = kategorie ? alle.find((r) => r.kategorie === kategorie) : null;
  const r = passend || alle[0];
  const eur = r.satz_von_eur;
  return eur ? Math.round(Number(eur) * 100) : null;
}

/* ------------------------------- Fitting ---------------------------------- */

const FITTING_PROMPT = `Du bist Staffing-Berater der Phalanx GmbH. Schreibe ein bis zwei
deutsche Sätze, warum dieses Profil zu dieser Anfrage passt. Der Text geht an den Kunden.

Regeln:
- Konkret auf die Anforderungen der Anfrage bezogen, nicht allgemein.
- KEINE Namen von Personen oder Firmen.
- Keine Werbesprache, keine Superlative, kein "ideal", kein "perfekt".
- Wenn eine Pflichtanforderung nicht belegt ist, benenne das offen in einem
  Halbsatz. Ein Kunde, der die Lücke selbst findet, vertraut der Vorlage nicht mehr.
- Antworte nur mit dem Text, ohne Anführungszeichen, ohne Vorrede.`;

/**
 * Ein Fitting erzeugen.
 *
 * Ohne Modell entsteht ein sachlicher Satz aus den Treffern. Der ist
 * langweilig, aber er stimmt, und du kannst ihn vor dem Versand überschreiben.
 */
async function baueFitting({ projekt, profilText, treffer = [], luecken = [], expert = null }) {
  try {
    const llm = getLlmProvider();
    const eingabe = [
      `Anfrage: ${projekt.name}`,
      projekt.beschreibung ? `Aufgabe: ${projekt.beschreibung}` : null,
      must(projekt).length ? `Must-haves: ${must(projekt).join('; ')}` : null,
      nice(projekt).length ? `Nice-to-have: ${nice(projekt).join('; ')}` : null,
      '',
      `Profil: ${profilText || '(kein Kurzprofil hinterlegt)'}`,
    ].filter(Boolean).join('\n');

    const text = await llm.matchExplain(
      { eingabe, breakdown: { treffer: treffer.length } },
      { EXPLAIN_PROMPT: FITTING_PROMPT },
    );
    const sauber = String(text || '').trim();
    // Auch hier gegen die echten Daten prüfen, nicht gegen eine Annahme.
    if (sauber && (!expert || !enthaeltKlardaten(sauber, expert))) return sauber;
  } catch { /* unten weiter */ }

  const teile = [];
  if (treffer.length) {
    teile.push(`Deckt ${treffer.length} der geforderten Punkte ab: ${treffer.slice(0, 4).join(', ')}.`);
  } else {
    teile.push('Die Eignung ergibt sich aus dem Profil, eine genaue Zuordnung zu den Anforderungen steht noch aus.');
  }
  if (luecken.length) teile.push(`Nicht belegt: ${luecken.slice(0, 3).join(', ')}.`);
  return teile.join(' ');
}

function must(p) { return alsListe(p.must_json); }
function nice(p) { return alsListe(p.nice_json); }
function alsListe(w) {
  if (!w) return [];
  const v = typeof w === 'string' ? (() => { try { return JSON.parse(w); } catch { return []; } })() : w;
  return Array.isArray(v) ? v.map(String) : [];
}

/**
 * Welche Anforderungen ein Profil belegt und welche nicht.
 *
 * Bewusst einfach: Steht ein Begriff aus der Anforderung in den Skills oder
 * im Profiltext, gilt er als belegt. Das ist grob, aber nachvollziehbar, und
 * es ist eine Vorsortierung für einen Menschen, kein Urteil.
 */
function deckung(anforderungen, { skills = [], text = '' }) {
  const heuhaufen = `${skills.join(' ')} ${text}`.toLowerCase();
  const treffer = []; const luecken = [];
  for (const a of anforderungen) {
    // Die tragenden Wörter einer Anforderung, nicht die Füllwörter.
    const woerter = String(a).toLowerCase()
      .replace(/[^a-zäöüß0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['erfahrung', 'kenntnisse', 'sehr', 'gute', 'einer', 'eines', 'mit', 'und', 'oder', 'idealerweise'].includes(w));
    const gefunden = woerter.length ? woerter.some((w) => heuhaufen.includes(w)) : false;
    (gefunden ? treffer : luecken).push(a);
  }
  return { treffer, luecken };
}

/* ------------------------------ Zusammenbau -------------------------------- */

/**
 * Eine Vorlage mit Positionen anlegen.
 *
 * Alles wird hier eingefroren: Kurzprofil, Satz, Fitting. Danach ist die
 * Vorlage unabhängig davon, was sich im Profil ändert.
 */
async function baue(db, {
  tenantId, projekt, expertIds, empfaenger = {}, aufschlag = null,
  anschreiben = null, gueltigTage = 30, benutzerId = null, mitModell = true,
}) {
  const prozent = await aufschlagFuer(db, {
    vendorUserId: empfaenger.vendor_user_id || null, ueberschreiben: aufschlag,
  });

  const [vorlage] = await db('vorlagen').insert({
    tenant_id: tenantId,
    project_id: projekt.id,
    vendor_user_id: empfaenger.vendor_user_id || null,
    empfaenger_firma: empfaenger.firma || null,
    empfaenger_name: empfaenger.name || null,
    empfaenger_email: empfaenger.email || null,
    token: crypto.randomBytes(24).toString('base64url'),
    aufschlag_prozent: prozent,
    anschreiben: anschreiben || null,
    gueltig_bis: gueltigTage ? new Date(Date.now() + gueltigTage * 86400000) : null,
    created_by: benutzerId,
  }).returning('*');

  const anforderungen = [...must(projekt), ...nice(projekt)];
  let i = 0;

  for (const expertId of expertIds) {
    const e = await db('experts').where({ id: expertId, tenant_id: tenantId }).first();
    if (!e) continue;

    const kurzprofil = await holeKurzprofil(db, e);
    const skills = (await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).select('skills.name')).map((s) => s.name);
    const { treffer, luecken } = deckung(anforderungen, { skills, text: `${kurzprofil || ''} ${e.kurzprofil || ''}` });

    const fitting = mitModell
      ? await baueFitting({ projekt, profilText: kurzprofil, treffer, luecken, expert: e })
      : null;

    // Beim Satz zählt, wie gearbeitet wird: remote ist oft günstiger als vor Ort.
    const einkauf = await satzVon(db, e.id, { kategorie: projekt.arbeitsmodell || null });
    const avail = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();

    await db('vorlage_positionen').insert({
      vorlage_id: vorlage.id,
      expert_id: e.id,
      kennung: kennungFuer(i),
      kurzprofil,
      fitting,
      profil_json: JSON.stringify({
        rolle: e.berufsbezeichnung || null,
        schwerpunkte: skills.slice(0, 10),
        treffer, luecken,
        verfuegbarkeit: avail ? {
          status: avail.status,
          ab_datum: avail.ab_datum,
          auslastung_prozent: avail.auslastung_prozent,
        } : null,
      }),
      satz_experte_cent: einkauf,
      satz_kunde_cent: satzMitAufschlag(einkauf, prozent),
      sortierung: i,
    });
    i += 1;
  }

  return db('vorlagen').where({ id: vorlage.id }).first();
}

/** Eine Vorlage mit allem, was der Empfänger sehen darf. */
async function fuerEmpfaenger(db, vorlage) {
  const projekt = await db('projects').where({ id: vorlage.project_id }).first();
  const positionen = await db('vorlage_positionen').where({ vorlage_id: vorlage.id }).orderBy('sortierung');

  return {
    projekt: {
      name: projekt.name,
      beschreibung: projekt.beschreibung,
      ort: projekt.ort,
      arbeitsmodell: projekt.arbeitsmodell,
      start: projekt.start,
      dauer: projekt.dauer,
      auslastung: projekt.auslastung,
    },
    anschreiben: vorlage.anschreiben,
    gueltig_bis: vorlage.gueltig_bis,
    profile: positionen.map((p) => {
      const j = typeof p.profil_json === 'string' ? JSON.parse(p.profil_json || '{}') : (p.profil_json || {});
      return {
        id: p.id,
        kennung: p.kennung,
        rolle: j.rolle,
        kurzprofil: p.kurzprofil,
        fitting: p.fitting,
        schwerpunkte: j.schwerpunkte || [],
        treffer: j.treffer || [],
        luecken: j.luecken || [],
        verfuegbarkeit: j.verfuegbarkeit || null,
        // Nur der Verkaufssatz. Was der Experte nimmt, geht den Empfänger nichts an.
        tagessatz_cent: p.satz_kunde_cent,
        reaktion: p.reaktion,
      };
    }),
  };
}

module.exports = {
  STANDARD_AUFSCHLAG, kennungFuer, aufschlagFuer, satzMitAufschlag, satzVon,
  deckung, baueFitting, baue, fuerEmpfaenger, must, nice, FITTING_PROMPT,
};
