/**
 * v1.41.0 — Der Vorschlagslauf über den Bestand.
 *
 * Läuft über alle Anschriften, die noch nicht in Feldern stehen, zerlegt sie
 * und legt das Ergebnis als Vorschlag ab. Er schreibt nie in die
 * Adressfelder: Das tut erst die Bestätigung durch einen Menschen.
 *
 * Der Trockenlauf ist der Normalfall, nicht die Ausnahme. Erst sehen, was
 * herauskäme, dann entscheiden.
 */
const { zerlege, zuZeile } = require('./adresse');

/** Die Quellen, aus denen eine Anschrift kommen kann. */
const SUBJEKTE = {
  expert: {
    tabelle: 'experts',
    // experts.ort ist der Arbeitsort aus der Suche, die Anschrift liegt in
    // adresse_ort. Zwei Bedeutungen, zwei Spalten.
    felder: { ort: 'adresse_ort', land: 'adresse_land' },
  },
  kunde: {
    tabelle: 'vendor_profiles',
    felder: { ort: 'ort', land: 'land' },
  },
};

/** Die Feldwerte so benennen, wie die jeweilige Tabelle sie führt. */
function aufTabelle(felder, typ) {
  const k = SUBJEKTE[typ].felder;
  return {
    strasse: felder.strasse || null,
    hausnummer: felder.hausnummer || null,
    adresszusatz: felder.adresszusatz || null,
    plz: felder.plz || null,
    [k.ort]: felder.ort || null,
    [k.land]: felder.land || 'DE',
  };
}

/**
 * Ein Lauf über einen Mandanten.
 *
 * Ohne `schreiben` passiert nichts außer Zählen: kein Vorschlag wird abgelegt,
 * keine Spalte berührt. Das ist der Trockenlauf.
 */
async function lauf({ db, tenantId, schreiben = false, nurTyp = null }) {
  const ergebnis = {
    geprueft: 0, sicher: 0, gemeldet: 0, schon_zerlegt: 0, ohne_adresse: 0,
    gruende: {}, beispiele: { sicher: [], gemeldet: [] },
  };

  for (const [typ, def] of Object.entries(SUBJEKTE)) {
    if (nurTyp && nurTyp !== typ) continue;

    const zeilen = await db(def.tabelle).where({ tenant_id: tenantId })
      .select('id', 'adresse_json', 'strasse', 'adresse_quelle');

    for (const z of zeilen) {
      // Was schon in Feldern steht, wird nicht angefasst. Ein zweiter Lauf
      // darf eine bestätigte Adresse nicht wieder in Frage stellen.
      if (z.strasse) { ergebnis.schon_zerlegt += 1; continue; }

      const roh = typeof z.adresse_json === 'string' ? z.adresse_json : z.adresse_json;
      const alsText = zuZeile(roh);
      if (!alsText.trim()) { ergebnis.ohne_adresse += 1; continue; }

      ergebnis.geprueft += 1;
      const obj = typeof roh === 'string' ? JSON.parse(roh || '{}') : (roh || {});
      const r = zerlege(Object.keys(obj).length ? obj : alsText);

      if (r.einstufung === 'sicher') {
        ergebnis.sicher += 1;
        if (ergebnis.beispiele.sicher.length < 5) {
          ergebnis.beispiele.sicher.push({ typ, id: z.id, original: alsText, felder: r.felder });
        }
      } else {
        ergebnis.gemeldet += 1;
        ergebnis.gruende[r.grund] = (ergebnis.gruende[r.grund] || 0) + 1;
        if (ergebnis.beispiele.gemeldet.length < 8) {
          ergebnis.beispiele.gemeldet.push({ typ, id: z.id, original: alsText, grund: r.grund });
        }
      }

      if (!schreiben) continue;

      // Ein offener Vorschlag je Subjekt und Herkunft. Ein zweiter Lauf
      // überschreibt den alten Vorschlag, statt einen Stapel anzulegen.
      const vorhanden = await db('adresse_vorschlag').where({
        tenant_id: tenantId, subjekt_typ: typ, subjekt_id: z.id,
        herkunft: 'zerleger', status: 'offen',
      }).first();

      const satz = {
        tenant_id: tenantId, subjekt_typ: typ, subjekt_id: z.id, herkunft: 'zerleger',
        original: alsText, vorschlag_json: JSON.stringify(r.felder || {}),
        einstufung: r.einstufung, grund: r.grund || null, status: 'offen',
      };
      if (vorhanden) await db('adresse_vorschlag').where({ id: vorhanden.id }).update(satz);
      else await db('adresse_vorschlag').insert(satz);
    }
  }

  return ergebnis;
}

/**
 * Einen Vorschlag übernehmen.
 *
 * Erst hier werden die Felder geschrieben, und das Original bleibt in
 * `adresse_roh` stehen. Wenn in einem halben Jahr jemand fragt, was da
 * vorher stand, soll die Antwort nicht "weg" lauten.
 */
async function uebernehmen({ db, tenantId, vorschlagId, benutzerId = null }) {
  const v = await db('adresse_vorschlag').where({ id: vorschlagId, tenant_id: tenantId }).first();
  if (!v) return { ok: false, grund: 'Vorschlag nicht gefunden' };
  if (v.status !== 'offen') return { ok: false, grund: 'Vorschlag ist schon entschieden' };

  const def = SUBJEKTE[v.subjekt_typ];
  if (!def) return { ok: false, grund: 'Unbekannte Art' };

  const felder = typeof v.vorschlag_json === 'string' ? JSON.parse(v.vorschlag_json) : (v.vorschlag_json || {});
  if (!felder.strasse || !felder.ort) {
    return { ok: false, grund: 'Der Vorschlag ist unvollständig und muss von Hand erfasst werden' };
  }

  await db(def.tabelle).where({ id: v.subjekt_id, tenant_id: tenantId }).update({
    ...aufTabelle(felder, v.subjekt_typ),
    adresse_quelle: v.herkunft === 'pool' ? 'pool' : 'zerlegt',
    adresse_am: new Date(),
    adresse_roh: v.original,
  });
  await db('adresse_vorschlag').where({ id: v.id })
    .update({ status: 'uebernommen', entschieden_von: benutzerId, entschieden_am: new Date() });

  return { ok: true, typ: v.subjekt_typ, id: v.subjekt_id, felder };
}

async function verwerfen({ db, tenantId, vorschlagId, benutzerId = null }) {
  const n = await db('adresse_vorschlag').where({ id: vorschlagId, tenant_id: tenantId, status: 'offen' })
    .update({ status: 'verworfen', entschieden_von: benutzerId, entschieden_am: new Date() });
  return { ok: n > 0 };
}

module.exports = { SUBJEKTE, aufTabelle, lauf, uebernehmen, verwerfen };
