/**
 * v1.40.0 — Stunden an Phalanx OS übergeben.
 *
 * Ein Leistungsnachweis wird zu genau einem Zeiteintrag drüben.
 *
 * Zur Form der Zeit, denn hier treffen zwei Welten aufeinander: Phalanx OS
 * führt Zeiten als Minuten an einem Tag. ExpertNetwork führt sie als Tage in
 * einem Monat, weil die Interim-Abrechnung auf Tagessätzen beruht und
 * niemand hier Stundenzettel schreibt. Aus 12,5 Tagen im September wird
 * deshalb EIN Eintrag über 6.000 Minuten, datiert auf den letzten Tag des
 * Monats, mit der Periode in der Beschreibung.
 *
 * Das sieht drüben grob aus, und das ist Absicht. Die Alternative wäre
 * gewesen, die Tage auf Arbeitstage zu verteilen. Dann stünden in der
 * Projektakte zwölf schöne Einträge, von denen kein einziger stimmt. Zahlen,
 * die genauer aussehen als sie sind, richten mehr Schaden an als grobe
 * Zahlen, denen man die Grobheit ansieht.
 *
 * Wiederholsicherheit: `extern_kennung` ist die Zeilennummer des Nachweises
 * und ändert sich nie. Phalanx OS legt daraus `source_ref` an, und weil das
 * Feld dort eindeutig ist, erzeugt eine zweimal gesendete Zeile keinen
 * zweiten Eintrag. Die Absicherung liegt in der Datenbank der Gegenstelle und
 * nicht in dieser Datei: Eine Prüfung im Code lässt sich umgehen, eine
 * Eindeutigkeit in der Tabelle nicht.
 *
 * Nach drüben gehen: Projektnummer, Datum, Minuten, Beschreibung, ob
 * abrechenbar, die Kennung und das Expertenkürzel. Sonst nichts. Kein
 * Klarname, keine Mailadresse, kein Tagessatz.
 */
const { kuerzelFuer } = require('./phalanxKuerzel');

const BASIS = () => (process.env.PHALANX_OS_BASE_URL || '').replace(/\/+$/, '');
const SCHLUESSEL = () => process.env.PHALANX_OS_API_KEY || '';
const eingerichtet = () => Boolean(BASIS() && SCHLUESSEL());

/**
 * Minuten je Tag. Acht Stunden, der übliche Ansatz für einen Beratertag.
 * Steht hier als Konstante, damit niemand sie an drei Stellen sucht, und ist
 * über die Umgebung verstellbar, falls Phalanx OS anders rechnet.
 */
const MINUTEN_JE_TAG = () => Number(process.env.PHALANX_MINUTEN_JE_TAG || 480);

/** Letzter Tag einer Periode YYYY-MM, als YYYY-MM-DD in Ortszeit. */
function letzterTag(periode) {
  const [j, m] = String(periode).split('-').map(Number);
  // Tag 0 des Folgemonats ist der letzte des gesuchten.
  const d = new Date(j, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Die Nutzlast für einen Nachweis.
 *
 * Bewusst eine reine Funktion ohne Netz und ohne Datenbank: So lässt sich im
 * Test prüfen, was tatsächlich hinausgeht, statt zu hoffen, dass es stimmt.
 */
function baueEintrag({ nachweis, nummer, kuerzel }) {
  const tage = Number(nachweis.tage) || 0;
  const minuten = Math.round(tage * MINUTEN_JE_TAG());
  const storniert = minuten === 0;

  return {
    nummer,
    datum: letzterTag(nachweis.periode),
    minuten,
    // Die Periode gehört in die Beschreibung, sonst steht drüben ein großer
    // Betrag an einem Tag und niemand weiß, wofür.
    beschreibung: [
      `Interim-Einsatz ${nachweis.periode}`,
      tage ? `${String(tage).replace('.', ',')} Tage` : 'storniert',
      nachweis.beschreibung || null,
    ].filter(Boolean).join(' · '),
    // Freigegeben oder abgerechnet heißt: Die Leistung ist anerkannt.
    abrechenbar: ['freigegeben', 'abgerechnet'].includes(nachweis.status),
    extern_kennung: String(nachweis.id),
    experte_kuerzel: kuerzel,
    // Gelöscht wird über diese Schnittstelle nichts. Eine zurückgenommene
    // Zeile kommt als null Minuten mit Stornovermerk, damit in der
    // Abrechnung keine Position verschwindet, die jemand schon gesehen hat.
    storniert,
  };
}

/**
 * Prüft, dass in einer Nutzlast nichts steht, was nicht hinaus darf.
 *
 * Diese Prüfung läuft vor jedem Versand, nicht nur im Test. Ein Feld, das
 * jemand in zwei Jahren gutgemeint ergänzt, fällt damit sofort auf, statt
 * still mitzureisen.
 */
const ERLAUBTE_FELDER = new Set([
  'nummer', 'datum', 'minuten', 'beschreibung', 'abrechenbar',
  'extern_kennung', 'experte_kuerzel', 'storniert',
]);

function pruefeNutzlast(eintrag, { verboteneWerte = [] } = {}) {
  const fremd = Object.keys(eintrag).filter((k) => !ERLAUBTE_FELDER.has(k));
  if (fremd.length) {
    throw new Error(`Unerlaubte Felder in der Nutzlast: ${fremd.join(', ')}`);
  }
  const text = JSON.stringify(eintrag).toLowerCase();
  for (const wert of verboteneWerte) {
    const w = String(wert || '').trim().toLowerCase();
    if (w.length >= 3 && text.includes(w)) {
      throw new Error('In der Nutzlast steht ein Wert, der nicht nach Phalanx OS gehört');
    }
  }
  return true;
}

/* -------------------------------- Versand -------------------------------- */

/**
 * Einen Eintrag senden. Gibt zurück, was passiert ist, statt zu werfen:
 * Ein Tageslauf über viele Nachweise darf nicht an einem einzigen abbrechen.
 */
async function sende(eintrag, { fetchImpl = fetch } = {}) {
  if (!eingerichtet()) return { ok: false, art: 'nicht_eingerichtet', text: 'Phalanx OS ist nicht eingerichtet' };

  let res;
  try {
    res = await fetchImpl(`${BASIS()}/api/extern/zeiten`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SCHLUESSEL()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eintrag),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { ok: false, art: 'nicht_erreichbar', text: e.name === 'TimeoutError' ? 'Zeitablauf' : 'Verbindungsfehler' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, art: 'schluessel_abgelehnt', text: 'Phalanx OS weist den Schlüssel zurück' };
  }
  // 409: Die Position ist drüben bereits abgerechnet. Das ist kein Fehler,
  // sondern die richtige Antwort. Eine Rechnung, deren Positionen sich
  // nachträglich ändern, ist schlimmer als eine fehlende Korrektur.
  if (res.status === 409) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, art: 'bereits_abgerechnet', text: d.error || d.message || 'In Phalanx OS bereits abgerechnet' };
  }
  if (res.status === 404) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, art: 'projekt_unbekannt', text: d.error || 'Phalanx OS kennt die Projektnummer nicht' };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, art: 'fehler', text: `Phalanx OS antwortet mit ${res.status} ${t.slice(0, 160)}` };
  }

  const d = await res.json().catch(() => ({}));
  return { ok: true, art: eintrag.storniert ? 'storniert' : 'uebergeben', antwort: d };
}

/**
 * Alle übergabefähigen Nachweise eines Mandanten abgleichen.
 *
 * Übergeben wird, was einem Mandat mit Projektnummer gehört und seit der
 * letzten Übergabe eine andere Minutenzahl hat. Ein Nachweis, der sich nicht
 * geändert hat, wird nicht noch einmal geschickt; dass es trotzdem ginge,
 * ist die Sicherung, nicht der Normalfall.
 */
async function gleicheAb({ db, tenantId, nurNachweisId = null, fetchImpl = fetch, audit = null }) {
  const ergebnis = {
    geprueft: 0, uebergeben: 0, storniert: 0, unveraendert: 0,
    abgerechnet: 0, fehler: 0, meldungen: [],
  };
  if (!eingerichtet()) {
    ergebnis.fehlertext = 'Phalanx OS ist nicht eingerichtet';
    return ergebnis;
  }

  const q = db('timesheets as t')
    .join('engagements as e', 'e.id', 't.engagement_id')
    .join('experts as x', 'x.id', 'e.expert_id')
    .where('t.tenant_id', tenantId)
    .whereNotNull('e.phalanx_projekt_nummer')
    // Offene Nachweise gehen nicht hinaus. Was der Experte noch bearbeitet,
    // hat in einer fremden Projektakte nichts verloren.
    .whereIn('t.status', ['eingereicht', 'freigegeben', 'abgerechnet'])
    .select('t.*', 'e.phalanx_projekt_nummer as nummer',
      'x.id as x_id', 'x.tenant_id as x_tenant', 'x.vorname', 'x.nachname',
      'x.email as x_email', 'x.phalanx_kuerzel');
  if (nurNachweisId) q.andWhere('t.id', nurNachweisId);

  const zeilen = await q;

  for (const z of zeilen) {
    ergebnis.geprueft += 1;
    try {
      const kuerzel = await kuerzelFuer(db, {
        id: z.x_id, tenant_id: z.x_tenant, vorname: z.vorname, nachname: z.nachname,
        phalanx_kuerzel: z.phalanx_kuerzel,
      });
      const eintrag = baueEintrag({ nachweis: z, nummer: z.nummer, kuerzel });

      // Vor jedem Versand gegen die echten Daten dieses Experten prüfen, nicht
      // gegen eine erfundene Liste.
      pruefeNutzlast(eintrag, { verboteneWerte: [z.vorname, z.nachname, z.x_email] });

      if (!nurNachweisId && z.phalanx_gesendet_am && z.phalanx_minuten === eintrag.minuten
        && z.phalanx_storniert === eintrag.storniert) {
        ergebnis.unveraendert += 1;
        continue;
      }

      const r = await sende(eintrag, { fetchImpl });

      if (r.ok) {
        await db('timesheets').where({ id: z.id }).update({
          phalanx_gesendet_am: new Date(),
          phalanx_minuten: eintrag.minuten,
          phalanx_storniert: eintrag.storniert,
          phalanx_fehler: null,
        });
        if (eintrag.storniert) ergebnis.storniert += 1; else ergebnis.uebergeben += 1;
        continue;
      }

      // Bereits abgerechnet: Der Vermerk bleibt stehen, damit es beim nächsten
      // Lauf nicht wieder versucht wird, und es gibt einen Protokolleintrag.
      if (r.art === 'bereits_abgerechnet') {
        ergebnis.abgerechnet += 1;
        ergebnis.meldungen.push(`${z.periode}: ${r.text}`);
        await db('timesheets').where({ id: z.id }).update({ phalanx_fehler: r.text });
        if (audit) {
          await audit({
            action: 'phalanx.zeit_bereits_abgerechnet', resource: 'timesheet', resourceId: z.id,
            newValue: { periode: z.periode, nummer: z.nummer, grund: r.text },
          });
        }
        continue;
      }

      ergebnis.fehler += 1;
      ergebnis.meldungen.push(`${z.periode}: ${r.text}`);
      await db('timesheets').where({ id: z.id }).update({ phalanx_fehler: r.text });
      if (r.art === 'schluessel_abgelehnt' && audit) {
        await audit({
          action: 'phalanx.zeiten_abgelehnt', resource: 'timesheet', resourceId: z.id,
          newValue: { grund: r.text },
        });
      }
    } catch (e) {
      // Ein einzelner Nachweis darf den Lauf nicht beenden.
      ergebnis.fehler += 1;
      ergebnis.meldungen.push(`${z.periode}: ${e.message}`);
      await db('timesheets').where({ id: z.id }).update({ phalanx_fehler: e.message });
    }
  }

  return ergebnis;
}

module.exports = {
  MINUTEN_JE_TAG, eingerichtet, letzterTag,
  baueEintrag, pruefeNutzlast, sende, gleicheAb, ERLAUBTE_FELDER,
};
