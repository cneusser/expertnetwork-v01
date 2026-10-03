/**
 * v1.39.0 — Projekte aus Phalanx OS lesen.
 *
 * Getrennt von `phalanxOs.js`, obwohl beide dieselbe Gegenstelle ansprechen.
 * Der Datenpool läuft über OIDC mit client_id und client_secret, die
 * Projektschnittstelle über einen einfachen Bearer-Schlüssel. Zwei Verfahren,
 * zwei Zuständigkeiten, zwei Dateien. In einer Datei stünden zwei Arten von
 * Geheimnis nebeneinander, und spätestens beim Protokollieren verwechselt das
 * jemand.
 *
 * Der Schlüssel steht ausschließlich in der Umgebung. Er wird nie
 * protokolliert, nie an den Client gegeben und taucht in keiner Fehlermeldung
 * auf, auch nicht gekürzt.
 *
 * Gelesen wird hier nur. Geschrieben wird in Stufe 2.
 */

const BASIS = () => (process.env.PHALANX_OS_BASE_URL || '').replace(/\/+$/, '');
const SCHLUESSEL = () => process.env.PHALANX_OS_API_KEY || '';

const eingerichtet = () => Boolean(BASIS() && SCHLUESSEL());
function fehlendeVariablen() {
  return ['PHALANX_OS_BASE_URL', 'PHALANX_OS_API_KEY'].filter((k) => !process.env[k]);
}

/**
 * Die Kategorien, wie Phalanx OS sie führt. Die ersten beiden Stellen der
 * Nummer. Steht hier, damit eine offensichtlich falsche Nummer gar nicht erst
 * eine Anfrage auslöst, und damit die Oberfläche gruppieren kann, ohne dafür
 * einen zweiten Endpunkt zu brauchen.
 */
const KATEGORIEN = {
  10: 'Kapitalisierung',
  20: 'StartUp',
  30: 'Beratung',
  40: 'Akademie',
};

/** Form der Nummer: fünf Ziffern, die ersten beiden eine bekannte Kategorie. */
function nummerGueltig(nummer) {
  const n = String(nummer || '').trim();
  if (!/^\d{5}$/.test(n)) return false;
  return Object.prototype.hasOwnProperty.call(KATEGORIEN, Number(n.slice(0, 2)));
}

function kategorieVon(nummer) {
  return nummerGueltig(nummer) ? KATEGORIEN[Number(String(nummer).slice(0, 2))] : null;
}

/* ------------------------------- Abruf ---------------------------------- */

let cache = null;
const CACHE_MS = 10 * 60 * 1000;

/**
 * Ein Aufruf gegen Phalanx OS. Fehler werden so weitergereicht, dass der
 * Schlüssel nicht mitkommt: Es steht nur der Status in der Meldung, nie der
 * Kopf der Anfrage.
 */
async function aufruf(pfad) {
  if (!eingerichtet()) {
    const e = new Error('Phalanx OS ist nicht eingerichtet');
    e.fehlend = fehlendeVariablen();
    e.code = 'nicht_eingerichtet';
    throw e;
  }
  // Dieselbe Basis wie der Datenpool, also dieselbe Stolperstelle.
  const { basisProblem } = require('./phalanxOs');
  const problem = basisProblem();
  if (problem) {
    const e = new Error(problem);
    e.code = 'basis_falsch';
    throw e;
  }

  let res;
  try {
    res = await fetch(`${BASIS()}${pfad}`, {
      headers: { Authorization: `Bearer ${SCHLUESSEL()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const f = new Error(`Phalanx OS nicht erreichbar (${e.name === 'TimeoutError' ? 'Zeitablauf' : 'Verbindungsfehler'})`);
    f.code = 'nicht_erreichbar';
    throw f;
  }
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Phalanx OS weist den Schlüssel zurück');
    e.code = 'schluessel_abgelehnt';
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Phalanx OS antwortet mit ${res.status}`);
    e.code = 'fehler';
    throw e;
  }
  return res.json();
}

/**
 * Alle Projekte. Abgeschlossene bleiben in der Liste und sind als solche
 * gekennzeichnet: Nachträgliche Stunden auf ein abgeschlossenes Projekt
 * kommen vor und sollen nicht daran scheitern, dass das Projekt aus der
 * Auswahl verschwunden ist.
 */
async function projekte({ frisch = false } = {}) {
  if (cache && !frisch && cache.geholt > Date.now() - CACHE_MS) return cache.liste;

  const antwort = await aufruf('/api/extern/projekte');
  const roh = Array.isArray(antwort) ? antwort : (antwort.projekte || antwort.projects || antwort.data || []);

  const liste = roh.map((p) => {
    const nummer = String(p.nummer ?? p.number ?? '').trim();
    return {
      nummer,
      name: p.name || '',
      // Phalanx OS führt die Kategorie selbst. Fehlt sie, leiten wir sie aus
      // der Nummer ab, statt ein leeres Feld anzuzeigen.
      kategorie: p.kategorie || kategorieVon(nummer) || '',
      phase: p.phase || '',
      offen: p.offen ?? p.open ?? true,
    };
  }).filter((p) => p.nummer);

  cache = { liste, geholt: Date.now() };
  return liste;
}

/**
 * Eine Nummer nachschlagen. Gibt das Projekt zurück oder null.
 *
 * Erst die Form prüfen, dann erst fragen. Eine Nummer mit vier Stellen oder
 * einer unbekannten Kategorie ist schon hier falsch, dafür muss niemand ein
 * Netz bemühen.
 */
async function finde(nummer, { frisch = false } = {}) {
  const n = String(nummer || '').trim();
  if (!nummerGueltig(n)) return null;
  const liste = await projekte({ frisch });
  const treffer = liste.find((p) => p.nummer === n);
  // Ein frisch angelegtes Projekt kennt der Zwischenspeicher noch nicht.
  // Einmal nachfassen, bevor wir eine gültige Nummer abweisen.
  if (!treffer && !frisch) return finde(n, { frisch: true });
  return treffer || null;
}

/** Lebenszeichen für die Verwaltungsseite. */
async function ping() {
  if (!eingerichtet()) return { ok: false, grund: 'nicht eingerichtet', fehlend: fehlendeVariablen() };
  try {
    const liste = await projekte({ frisch: true });
    return { ok: true, gelesen: liste.length, offen: liste.filter((p) => p.offen).length };
  } catch (e) {
    return { ok: false, grund: e.message, code: e.code || 'fehler' };
  }
}

function cacheLeeren() { cache = null; }

module.exports = {
  KATEGORIEN, eingerichtet, fehlendeVariablen,
  nummerGueltig, kategorieVon, projekte, finde, ping, cacheLeeren,
};
