/**
 * v1.44.0 — Die anonyme Anfrage an die Kandidaten.
 *
 * Bevor ein Profil zum Kunden geht, wird gefragt: Interesse, und ab wann.
 * Das spart die peinlichste Lage im Geschäft, nämlich ein vorgelegtes Profil,
 * dessen Inhaber gerade woanders unterschrieben hat.
 *
 * Der Kandidat erfährt NICHT, wer der Kunde ist.
 *
 * Das ist keine Geheimniskrämerei, sondern die Geschäftsgrundlage: Wer weiß,
 * wer sucht, kann direkt anrufen, und dann war die Arbeit umsonst. Deshalb
 * wird der Text nicht nur ohne Kundennamen gebaut, sondern vor dem Versand
 * gegen die tatsächlich bekannten Namen geprüft. Ein Kundenname, der in der
 * Projektbeschreibung mitgeschleppt wurde, fällt damit auf, bevor er
 * hinausgeht.
 */
const crypto = require('crypto');

/**
 * Alle Namen, die zu diesem Projekt einen Auftraggeber verraten könnten.
 *
 * Gesammelt aus allem, was wir über die Herkunft wissen: der Anfrage, aus der
 * das Projekt entstand, den Vorlagen, die schon hinausgingen, und dem
 * eingetragenen Kunden.
 */
async function kundennamen(db, projekt) {
  const namen = [];

  const anfrage = await db('anfragen').where({ project_id: projekt.id }).first();
  if (anfrage) namen.push(anfrage.absender_firma, anfrage.absender_name);

  const vorlagen = await db('vorlagen').where({ project_id: projekt.id }).select('empfaenger_firma', 'empfaenger_name');
  for (const v of vorlagen) namen.push(v.empfaenger_firma, v.empfaenger_name);

  if (projekt.vendor_id) {
    const v = await db('vendor_profiles').where({ user_id: projekt.vendor_id }).first();
    if (v) namen.push(v.firmenname);
  }

  // Zu kurze Begriffe taugen nicht als Suchmuster: "AG" steckt in "Anlage".
  return [...new Set(namen.map((n) => String(n || '').trim()).filter((n) => n.length >= 4))];
}

/** Steht einer der Namen im Text? Gibt die Treffer zurück, sonst null. */
function verraet(text, namen) {
  const t = String(text || '').toLowerCase();
  const treffer = namen.filter((n) => t.includes(n.toLowerCase()));
  return treffer.length ? treffer : null;
}

/**
 * Der Text, den der Kandidat sieht.
 *
 * Alles, was er für seine Entscheidung braucht: Aufgabe, Zeitraum, Umfang,
 * Ort, Anforderungen. Nichts darüber hinaus.
 */
function kandidatenSicht(projekt) {
  const liste = (w) => {
    if (!w) return [];
    const v = typeof w === 'string' ? (() => { try { return JSON.parse(w); } catch { return []; } })() : w;
    return Array.isArray(v) ? v.map(String) : [];
  };
  return {
    titel: projekt.name,
    beschreibung: projekt.beschreibung,
    start: projekt.start,
    dauer: projekt.dauer,
    auslastung: projekt.auslastung,
    ort: projekt.ort,
    arbeitsmodell: projekt.arbeitsmodell,
    must: liste(projekt.must_json),
    nice: liste(projekt.nice_json),
    // Kein Kunde, kein Vermittler, kein Budget. Der Satz wird mit dem
    // Kandidaten einzeln besprochen, nicht in einer Rundanfrage verhandelt.
  };
}

/**
 * Prüft, ob die Kandidatensicht einen Auftraggeber verrät.
 *
 * Wird vor jedem Versand aufgerufen, nicht nur im Test. Gefunden wird, was
 * tatsächlich bekannt ist, nicht was wir uns ausgedacht haben.
 */
async function pruefeAnonym(db, projekt) {
  const namen = await kundennamen(db, projekt);
  if (!namen.length) return { ok: true, namen: [] };

  const sicht = kandidatenSicht(projekt);
  const text = JSON.stringify(sicht);
  const treffer = verraet(text, namen);

  return treffer
    ? { ok: false, namen, treffer, stelle: wo(sicht, treffer) }
    : { ok: true, namen };
}

/** In welchem Feld steht der Name? Hilft beim Beheben. */
function wo(sicht, treffer) {
  for (const [feld, wert] of Object.entries(sicht)) {
    const t = JSON.stringify(wert || '').toLowerCase();
    if (treffer.some((n) => t.includes(n.toLowerCase()))) return feld;
  }
  return null;
}

function neuerToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Die Kandidaten einer Auswahl anfragen.
 *
 * Wer schon gefragt wurde und geantwortet hat, wird nicht noch einmal
 * behelligt. Wer gefragt wurde und nicht geantwortet hat, bekommt denselben
 * Link erneut: Ein zweiter Token würde den ersten entwerten, und manche
 * antworten auf die erste Mail eine Woche später.
 */
async function frage(db, { tenantId, projekt, applicationIds, fristTage = 7, senden = null }) {
  const anonym = await pruefeAnonym(db, projekt);
  if (!anonym.ok) {
    return {
      ok: false,
      fehler: `Die Projektbeschreibung nennt "${anonym.treffer.join('", "')}"`
        + `${anonym.stelle ? ` im Feld ${anonym.stelle}` : ''}. `
        + 'An die Kandidaten geht nichts hinaus, was den Auftraggeber verrät. Bitte zuerst dort entfernen.',
      treffer: anonym.treffer,
    };
  }

  const zeilen = await db('applications as a')
    .join('experts as e', 'e.id', 'a.expert_id')
    .whereIn('a.id', applicationIds).andWhere('a.tenant_id', tenantId)
    .select('a.*', 'e.vorname', 'e.nachname', 'e.email', 'e.id as e_id');

  const frist = new Date(Date.now() + fristTage * 86400000);
  const ergebnis = { gefragt: 0, erneut: 0, uebersprungen: 0, ohne_mail: 0, meldungen: [] };

  for (const z of zeilen) {
    if (z.antwort) { ergebnis.uebersprungen += 1; continue; }
    if (!z.email) {
      ergebnis.ohne_mail += 1;
      ergebnis.meldungen.push(`${z.vorname} ${z.nachname}: keine Mailadresse hinterlegt`);
      continue;
    }

    const token = z.anfrage_token || neuerToken();
    const erneut = Boolean(z.anfrage_token);

    await db('applications').where({ id: z.id }).update({
      anfrage_token: token,
      anfrage_am: new Date(),
      anfrage_frist: frist,
      status: ['vorgeschlagen', 'beworben'].includes(z.status) ? 'angefragt' : z.status,
    });

    if (senden) {
      await senden({
        an: z.email,
        vorname: z.vorname,
        nachname: z.nachname,
        token,
        frist,
        projekt: kandidatenSicht(projekt),
      });
    }

    if (erneut) ergebnis.erneut += 1; else ergebnis.gefragt += 1;
  }

  return { ok: true, ...ergebnis };
}

/** Die Antwort eines Kandidaten verbuchen. */
async function antworte(db, { token, interesse, verfuegbarAb = null, auslastung = null, notiz = null, wunschSatz = null }) {
  const a = await db('applications').where({ anfrage_token: token }).first();
  if (!a) return { ok: false, grund: 'nicht_gefunden' };
  if (a.anfrage_frist && new Date(a.anfrage_frist) < new Date() && !a.antwort) {
    // Abgelaufen, aber wir nehmen die Antwort trotzdem: Eine späte Zusage ist
    // besser als keine, und wer zu spät kommt, soll das von uns hören und
    // nicht von einer Fehlerseite.
  }

  const antwort = interesse ? 'interessiert' : 'abgesagt';
  await db('applications').where({ id: a.id }).update({
    antwort,
    antwort_am: new Date(),
    verfuegbar_ab: verfuegbarAb ? String(verfuegbarAb).slice(0, 80) : null,
    auslastung: auslastung ? String(auslastung).slice(0, 40) : null,
    antwort_notiz: notiz ? String(notiz).slice(0, 2000) : null,
    wunsch_satz_eur: wunschSatz ? Number(wunschSatz) : null,
    status: interesse ? 'interessiert' : 'abgesagt',
  });

  return { ok: true, application_id: a.id, antwort, spaet: Boolean(a.anfrage_frist && new Date(a.anfrage_frist) < new Date()) };
}

module.exports = {
  kundennamen, verraet, kandidatenSicht, pruefeAnonym, frage, antworte, neuerToken,
};
