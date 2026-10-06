/**
 * v1.41.0 — Adressen zerlegen und anzeigen.
 *
 * Zwei Aufgaben, bewusst in einer Datei, weil sie dasselbe Format betreffen:
 * aus einer gewachsenen Zeile Felder machen, und aus Feldern wieder eine
 * lesbare Anschrift.
 *
 * Grundhaltung beim Zerlegen: Im Zweifel nicht. Eine falsch zerlegte Adresse
 * sieht ordentlich aus und ist trotzdem falsch, und auf einer Rechnung merkt
 * man es erst, wenn sie zurückkommt. Deshalb gibt es nur zwei Ausgänge,
 * "sicher" und "melden", und der zweite ist kein Makel, sondern der
 * Normalfall für alles, was nicht eindeutig ist.
 *
 * Was nie passiert: automatisch überschreiben. Der Zerleger schlägt vor, ein
 * Mensch bestätigt. Das Original bleibt stehen, bis das geschehen ist.
 */

/* ------------------------------- Anzeige --------------------------------- */

/**
 * Die Anzeigezeilen aus den Feldern. Wird gerechnet, nicht gespeichert: Eine
 * gespeicherte Anzeigezeile ist am Tag nach der ersten Korrektur falsch.
 *
 * Deutsche Reihenfolge: Straße mit Hausnummer, Zusatz, dann Postleitzahl und
 * Ort. Das Land steht nur da, wenn es nicht das eigene ist; "Deutschland"
 * unter einer deutschen Adresse liest sich wie ein Fehler.
 */
function anzeigeZeilen(a = {}, { eigenesLand = 'DE' } = {}) {
  const f = (w) => String(w ?? '').trim();
  const zeilen = [];

  const strasse = [f(a.strasse), f(a.hausnummer)].filter(Boolean).join(' ');
  if (strasse) zeilen.push(strasse);
  if (f(a.adresszusatz)) zeilen.push(f(a.adresszusatz));

  const ort = [f(a.plz), f(a.ort)].filter(Boolean).join(' ');
  if (ort) zeilen.push(ort);

  const land = f(a.land).toUpperCase();
  if (land && land !== eigenesLand) zeilen.push(LAENDER[land] || land);

  return zeilen;
}

/** Dieselbe Anschrift einzeilig, etwa für Listen und Tabellen. */
function anzeigeZeile(a = {}, opt = {}) {
  return anzeigeZeilen(a, opt).join(', ');
}

/** Nur die Länder, die hier vorkommen. Keine vollständige Liste pflegen. */
const LAENDER = {
  DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', LI: 'Liechtenstein',
  NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', FR: 'Frankreich',
  IT: 'Italien', ES: 'Spanien', PL: 'Polen', CZ: 'Tschechien',
  DK: 'Dänemark', SE: 'Schweden', GB: 'Vereinigtes Königreich', US: 'USA',
};

/** Schreibweisen, die Menschen eintippen, auf den Code bringen. */
const LAND_ALIASE = {
  DEUTSCHLAND: 'DE', GERMANY: 'DE', BRD: 'DE', GER: 'DE', D: 'DE', DE: 'DE',
  OESTERREICH: 'AT', ÖSTERREICH: 'AT', AUSTRIA: 'AT', AT: 'AT', A: 'AT',
  SCHWEIZ: 'CH', SWITZERLAND: 'CH', CH: 'CH',
  NIEDERLANDE: 'NL', NETHERLANDS: 'NL', NL: 'NL',
  FRANKREICH: 'FR', FRANCE: 'FR', FR: 'FR',
  LUXEMBURG: 'LU', LU: 'LU', BELGIEN: 'BE', BE: 'BE',
  ITALIEN: 'IT', IT: 'IT', SPANIEN: 'ES', ES: 'ES',
  POLEN: 'PL', PL: 'PL', TSCHECHIEN: 'CZ', CZ: 'CZ',
  GROSSBRITANNIEN: 'GB', 'UNITED KINGDOM': 'GB', UK: 'GB', GB: 'GB',
  USA: 'US', US: 'US', 'VEREINIGTE STAATEN': 'US',
};

function landCode(wert, standard = 'DE') {
  const w = String(wert || '').trim().toUpperCase();
  if (!w) return standard;
  if (LAND_ALIASE[w]) return LAND_ALIASE[w];
  if (/^[A-Z]{2}$/.test(w)) return w; // schon ein Code, auch ein hier unbekannter
  return null; // nicht deutbar, das ist eine Meldung wert
}

/* ------------------------------ Zerlegung -------------------------------- */

/**
 * Die Straße endet mit der Hausnummer: eine Ziffernfolge, optional mit
 * Buchstaben, Bindestrich oder Schrägstrich. "Helene-Lange-Straße 28" ist der
 * Normalfall, "Am Markt 3-5" und "Hauptstr. 12a" ebenso.
 *
 * Nicht erfasst wird die österreichische Form "Stiege 2, Tür 5" und alles,
 * was mit einer Hausnummer beginnt. Beides kommt vor, beides wird gemeldet
 * statt geraten.
 */
const HAUSNUMMER = /^(.*?)[\s,]+(\d+\s*[-/]?\s*\d*\s*[a-zA-Z]?)$/;

/** PLZ und Ort: fünf Ziffern, dann der Ortsname. */
const PLZ_ORT = /^(\d{5})\s+(.+)$/;

const POSTFACH = /\b(postfach|p\.?\s?o\.?\s?box|pf\s*\d)/i;

/**
 * Eine Adresse aus Teilen zerlegen.
 *
 * Eingabe ist entweder eine Zeile oder das alte Objekt mit strasse/plz/ort.
 * Rückgabe immer dieselbe Form: { einstufung, grund, felder }.
 *
 * einstufung ist "sicher" oder "melden". Nichts dazwischen: Ein "wahrscheinlich"
 * würde am Ende doch jemand übernehmen, ohne hinzusehen.
 */
function zerlege(eingabe, { standardLand = 'DE' } = {}) {
  const roh = typeof eingabe === 'string' ? eingabe : zuZeile(eingabe);
  const text = String(roh || '').replace(/\s+/g, ' ').trim();

  const melde = (grund, felder = {}) => ({ einstufung: 'melden', grund, felder, original: roh });
  const sicher = (felder) => ({ einstufung: 'sicher', grund: null, felder, original: roh });

  if (!text) return melde('leer');

  // Postfach ist keine Hausanschrift. Automatisch zerlegt landete es als
  // Straße "Postfach" mit Hausnummer, und an ein Postfach kann man nichts
  // ausliefern, was eine Hausanschrift braucht.
  if (POSTFACH.test(text)) return melde('Postfach, keine Hausanschrift');

  // Zwei Adressen in einem Feld: zweimal etwas, das wie eine PLZ aussieht.
  if ((text.match(/\b\d{5}\b/g) || []).length > 1) {
    return melde('mehrere Postleitzahlen, vermutlich zwei Adressen in einem Feld');
  }

  // Ein Objekt mit sauber getrennten Feldern braucht nur die Hausnummer aus
  // der Straße gelöst zu bekommen.
  const ausObjekt = typeof eingabe === 'object' && eingabe !== null ? eingabe : null;
  if (ausObjekt && ausObjekt.strasse && ausObjekt.ort) {
    return ausGetrennten(ausObjekt, { standardLand, roh });
  }

  // Einzeiler: an Kommas trennen, sonst am PLZ-Muster.
  const teile = text.split(',').map((t) => t.trim()).filter(Boolean);
  if (teile.length < 2) {
    const m = text.match(/^(.*?)\s+(\d{5}\s+.+)$/);
    if (!m) return melde('kein erkennbarer Aufbau, Postleitzahl und Ort fehlen');
    teile.length = 0;
    teile.push(m[1].trim(), m[2].trim());
  }

  // Das letzte Teil kann das Land sein.
  let land = standardLand;
  let landGemeldet = false;
  const letztes = teile[teile.length - 1];
  if (!/\d/.test(letztes) && teile.length >= 3) {
    const c = landCode(letztes, null);
    if (c) { land = c; teile.pop(); } else { landGemeldet = true; }
  }
  if (landGemeldet) return melde(`Land nicht deutbar: ${letztes}`);

  const plzTeil = teile.find((t) => PLZ_ORT.test(t));
  if (!plzTeil) {
    // Ausländische Formate haben oft keine fünfstellige PLZ: 1010 Wien,
    // CH-8001 Zürich, SW1A 1AA London. Raten wäre hier besonders riskant.
    if (/\b[A-Z]{1,2}-?\d{4,6}\b/i.test(text) || /\b\d{4}\b/.test(text)) {
      return melde('ausländisches Adressformat');
    }
    return melde('keine fünfstellige Postleitzahl gefunden');
  }
  const [, plz, ort] = plzTeil.match(PLZ_ORT);

  const vorPlz = teile.slice(0, teile.indexOf(plzTeil));
  if (!vorPlz.length) return melde('keine Straße vor der Postleitzahl');

  // Alles vor der PLZ außer der Straße ist Zusatz: "c/o", "Gebäude B", "3. OG".
  const strasseRoh = vorPlz[0];
  const zusatz = vorPlz.slice(1).join(', ') || null;

  const m = strasseRoh.match(HAUSNUMMER);
  if (!m) return melde('keine Hausnummer erkennbar', { plz, ort, land });

  const felder = {
    strasse: m[1].trim(),
    hausnummer: m[2].replace(/\s+/g, ''),
    adresszusatz: zusatz,
    plz, ort: ort.trim(), land,
  };

  // Nachkontrolle: Wenn in der Straße noch Ziffern stehen, war die Trennung
  // nicht eindeutig. "Straße des 17. Juni 135" ist der Fall, an den man nicht
  // denkt, und der auffällt, wenn man hinsieht.
  if (/\d/.test(felder.strasse)) {
    return melde('Ziffern in der Straße, Trennung nicht eindeutig', felder);
  }
  if (felder.ort.length < 2) return melde('Ort zu kurz', felder);

  return sicher(felder);
}

/** Aus einem Objekt mit getrennter Straße nur die Hausnummer lösen. */
function ausGetrennten(o, { standardLand, roh }) {
  const land = landCode(o.land, standardLand);
  if (!land) return { einstufung: 'melden', grund: `Land nicht deutbar: ${o.land}`, felder: {}, original: roh };

  const plz = String(o.plz || '').trim();
  if (!/^\d{5}$/.test(plz)) {
    return {
      einstufung: 'melden',
      grund: plz ? `Postleitzahl nicht fünfstellig: ${plz}` : 'Postleitzahl fehlt',
      felder: { ort: String(o.ort || '').trim(), land },
      original: roh,
    };
  }

  const s = String(o.strasse).trim();
  if (POSTFACH.test(s)) {
    return { einstufung: 'melden', grund: 'Postfach, keine Hausanschrift', felder: {}, original: roh };
  }
  const m = s.match(HAUSNUMMER);
  if (!m) {
    return {
      einstufung: 'melden', grund: 'keine Hausnummer erkennbar',
      felder: { plz, ort: String(o.ort).trim(), land }, original: roh,
    };
  }
  const felder = {
    strasse: m[1].trim(), hausnummer: m[2].replace(/\s+/g, ''),
    adresszusatz: o.adresszusatz || null, plz, ort: String(o.ort).trim(), land,
  };
  if (/\d/.test(felder.strasse)) {
    return { einstufung: 'melden', grund: 'Ziffern in der Straße, Trennung nicht eindeutig', felder, original: roh };
  }
  return { einstufung: 'sicher', grund: null, felder, original: roh };
}

/** Ein altes Adressobjekt als Zeile, für Protokoll und Vergleich. */
function zuZeile(o) {
  if (!o) return '';
  const obj = typeof o === 'string' ? sicherJson(o) : o;
  if (!obj) return String(o);
  return [obj.strasse, obj.adresszusatz, [obj.plz, obj.ort].filter(Boolean).join(' '), obj.land]
    .filter(Boolean).join(', ');
}

function sicherJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** Haben zwei Anschriften denselben Inhalt? Für den Abgleich mit dem Pool. */
function gleich(a = {}, b = {}) {
  const n = (w) => String(w ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ['strasse', 'hausnummer', 'adresszusatz', 'plz', 'ort', 'land']
    .every((k) => n(a[k]) === n(b[k]));
}

/** Ist überhaupt eine Anschrift da? */
function istBefuellt(a = {}) {
  return Boolean(String(a.strasse || '').trim() && String(a.ort || '').trim());
}

module.exports = {
  LAENDER, landCode, anzeigeZeilen, anzeigeZeile,
  zerlege, zuZeile, gleich, istBefuellt,
};
