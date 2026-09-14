/**
 * v1.25.0 — Vorregistrierung: Import aus Listen und Zuordnung bei der Registrierung.
 *
 * Beide Wege benutzen dieselbe Suchreihenfolge, damit die Zuordnung beim Import
 * (Dublette erkennen) und bei der Registrierung (Datensatz übernehmen) niemals
 * auseinanderlaufen:
 *   1. E-Mail exakt, gegen users und experts
 *   2. LinkedIn-Profil, normalisiert
 *   3. Namensschlüssel, aber nur bei genau einem Treffer
 *
 * Grundsatz: bei Mehrdeutigkeit wird nicht geraten, sondern nachgefragt.
 */
const { db } = require('../db/knex');
const { nameKey, linkedinKey, emailKey } = require('./normalisieren');

const VORREG = 'vorregistriert';

/** Felder, die aus einer Liste stammen dürfen. */
function baueDatensatz(zeile, tenantId) {
  return {
    tenant_id: tenantId,
    status: VORREG,
    vorname: String(zeile.vorname || '').trim().slice(0, 100),
    nachname: String(zeile.nachname || '').trim().slice(0, 100),
    email: emailKey(zeile.email),
    linkedin: linkedinKey(zeile.linkedin),
    firma: String(zeile.firma || '').trim().slice(0, 150) || null,
    berufsbezeichnung: String(zeile.berufsbezeichnung || '').trim().slice(0, 200) || null,
    name_key: nameKey(zeile.vorname, zeile.nachname),
    vorreg_quelle: String(zeile.quelle || '').trim().slice(0, 150) || null,
    vorreg_prio: String(zeile.prio || '').trim().toUpperCase().slice(0, 1) || null,
    vorreg_kanal: /mail/i.test(zeile.kanal || '') ? 'email' : (zeile.kanal ? 'linkedin' : null),
    vorreg_letzter_kontakt: datumOderNull(zeile.letzter_kontakt),
    vorreg_importiert_am: new Date(),
  };
}

function datumOderNull(wert) {
  if (!wert) return null;
  const s = String(wert).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Sucht eine Person im Bestand. Liefert { treffer, weg, mehrdeutig }.
 * weg ist 'email', 'linkedin' oder 'name'. nurVorregistriert grenzt die Suche auf
 * vorbereitete Datensätze ohne Konto ein, das braucht die Registrierung.
 */
async function findePerson(tenantId, { email, linkedin, vorname, nachname }, { nurVorregistriert = false } = {}) {
  const basis = () => {
    const q = db('experts').where('tenant_id', tenantId);
    if (nurVorregistriert) q.andWhere('status', VORREG).whereNull('user_id');
    return q;
  };

  const mail = emailKey(email);
  if (mail) {
    const perMail = await basis().whereRaw('lower(trim(email)) = ?', [mail]).first();
    if (perMail) return { treffer: perMail, weg: 'email', mehrdeutig: false };
    if (!nurVorregistriert) {
      // Auch ein Konto ohne Expertenprofil zählt als vorhanden.
      const user = await db('users').whereRaw('lower(trim(email)) = ?', [mail]).first();
      if (user) {
        const profil = await db('experts').where({ user_id: user.id }).first();
        return { treffer: profil || { id: null, status: 'konto ohne Profil', email: user.email }, weg: 'email', mehrdeutig: false };
      }
    }
  }

  const li = linkedinKey(linkedin);
  if (li) {
    const perLinkedin = await basis().whereRaw('lower(trim(linkedin)) = ?', [li]).first();
    if (perLinkedin) return { treffer: perLinkedin, weg: 'linkedin', mehrdeutig: false };
  }

  const key = nameKey(vorname, nachname);
  if (key) {
    const perName = await basis().where('name_key', key).limit(5);
    if (perName.length === 1) return { treffer: perName[0], weg: 'name', mehrdeutig: false };
    if (perName.length > 1) return { treffer: perName[0], weg: 'name', mehrdeutig: true, kandidaten: perName };
  }

  return { treffer: null, weg: null, mehrdeutig: false };
}

/**
 * Eine Liste einlesen. Legt nur an, was es noch nicht gibt, und meldet für alles
 * andere den Status des vorhandenen Datensatzes zurück. Mehrfach aufrufbar, ohne
 * dass Dubletten entstehen.
 */
async function importiereListe(zeilen, { tenantId, actorId = null, ip = null } = {}) {
  const ergebnis = { angelegt: [], vorhanden: [], ausgeschlossen: [], fehler: [] };

  for (const zeile of zeilen) {
    const vorname = String(zeile.vorname || '').trim();
    const nachname = String(zeile.nachname || '').trim();
    if (!vorname || !nachname) {
      ergebnis.fehler.push({ ...zeile, grund: 'Vorname oder Nachname fehlt' });
      continue;
    }
    try {
      // v1.26.1 — Wer einmal aus der Ansprache genommen wurde, kommt nicht wieder rein.
      const gesperrt = await istAusgeschlossen(tenantId, { email: zeile.email, linkedin: zeile.linkedin, vorname, nachname });
      if (gesperrt) {
        ergebnis.ausgeschlossen.push({
          vorname, nachname, linkedin: linkedinKey(zeile.linkedin), grund: gesperrt.grund || 'ohne Angabe',
        });
        continue;
      }
      const fund = await findePerson(tenantId, { email: zeile.email, linkedin: zeile.linkedin, vorname, nachname });
      if (fund.treffer) {
        ergebnis.vorhanden.push({
          vorname, nachname, linkedin: linkedinKey(zeile.linkedin),
          expert_id: fund.treffer.id, status: fund.treffer.status,
          erkannt_ueber: fund.weg, mehrdeutig: fund.mehrdeutig,
        });
        continue;
      }
      const daten = baueDatensatz({ ...zeile, vorname, nachname }, tenantId);
      const [neu] = await db('experts').insert(daten).returning(['id', 'vorname', 'nachname', 'linkedin']);
      ergebnis.angelegt.push({ ...neu, prio: daten.vorreg_prio, kanal: daten.vorreg_kanal });
    } catch (err) {
      ergebnis.fehler.push({ vorname, nachname, grund: err.message });
    }
  }

  await db('audit_log').insert({
    tenant_id: tenantId, actor_id: actorId, action: 'expert.vorregistrierung_import',
    resource: 'experts',
    new_value_json: JSON.stringify({
      angelegt: ergebnis.angelegt.length,
      vorhanden: ergebnis.vorhanden.length,
      ausgeschlossen: ergebnis.ausgeschlossen.length,
      fehler: ergebnis.fehler.length,
    }),
    ip,
  }).catch(() => { /* Protokoll darf den Import nie kippen */ });

  return ergebnis;
}

/**
 * v1.26.1 — Steht die Person auf der Merkliste "nicht ansprechen"?
 * Geprüft wird in derselben Reihenfolge wie überall: E-Mail, LinkedIn, Name.
 */
async function istAusgeschlossen(tenantId, { email, linkedin, vorname, nachname }) {
  const mail = emailKey(email);
  const li = linkedinKey(linkedin);
  const key = nameKey(vorname, nachname);
  const q = db('ansprache_ausschluss').where('tenant_id', tenantId).where(function oder() {
    let leer = true;
    if (mail) { this.orWhereRaw('lower(trim(email)) = ?', [mail]); leer = false; }
    if (li) { this.orWhereRaw('lower(trim(linkedin)) = ?', [li]); leer = false; }
    if (key) { this.orWhere('name_key', key); leer = false; }
    if (leer) this.whereRaw('1 = 0');
  });
  return q.first();
}

/** Person auf die Merkliste setzen. Doppelte Einträge werden vermieden. */
async function merkeAusschluss(tenantId, person, { grund = null, actorId = null } = {}) {
  const vorhanden = await istAusgeschlossen(tenantId, person);
  if (vorhanden) return vorhanden;
  const [eintrag] = await db('ansprache_ausschluss').insert({
    tenant_id: tenantId,
    anzeige_name: `${person.vorname || ''} ${person.nachname || ''}`.trim() || '(ohne Namen)',
    name_key: nameKey(person.vorname, person.nachname),
    linkedin: linkedinKey(person.linkedin),
    email: emailKey(person.email),
    grund: grund ? String(grund).slice(0, 300) : null,
    created_by: actorId,
  }).returning('*');
  return eintrag;
}

/**
 * Vorbereiteten Datensatz auf ein frisch registriertes Konto übernehmen.
 * Es bleibt genau ein Datensatz: der vorbereitete. Ein eventuell schon
 * angelegtes Minimalprofil wird vorher entfernt, seine Verknüpfungen gibt es
 * zu diesem Zeitpunkt noch nicht.
 */
async function uebernehmen(vorregId, user, { vorname, nachname, linkedin, minimalprofilId = null } = {}) {
  if (minimalprofilId && minimalprofilId !== vorregId) {
    await db('experts').where({ id: minimalprofilId }).delete();
  }
  const vorher = await db('experts').where({ id: vorregId }).first();
  const patch = {
    user_id: user.id,
    status: 'registriert',
    email: emailKey(user.email) || vorher.email,
    vorreg_zusammengefuehrt_am: new Date(),
  };
  if (vorname) { patch.vorname = String(vorname).trim().slice(0, 100); }
  if (nachname) { patch.nachname = String(nachname).trim().slice(0, 100); }
  if (patch.vorname || patch.nachname) {
    patch.name_key = nameKey(patch.vorname || vorher.vorname, patch.nachname || vorher.nachname);
  }
  const li = linkedinKey(linkedin);
  if (li && !vorher.linkedin) patch.linkedin = li;

  const [nachher] = await db('experts').where({ id: vorregId }).update(patch).returning('*');
  await db('audit_log').insert({
    tenant_id: vorher.tenant_id, actor_id: user.id,
    action: 'expert.vorregistrierung_zusammengefuehrt',
    resource: 'experts', resource_id: vorregId,
    old_value_json: JSON.stringify({ status: vorher.status, quelle: vorher.vorreg_quelle }),
    new_value_json: JSON.stringify({ status: 'registriert', user_id: user.id }),
  }).catch(() => {});
  return nachher;
}

/**
 * v1.25.1 — Reparatur nach einem Fehlimport.
 *
 * Der alte Einladungs-Upload hat Vor- und Nachname aus derselben Spalte gelesen
 * ("Achim Achim") und Firma, Position und LinkedIn gar nicht erst übernommen.
 * Diese Funktion liest dieselbe Datei noch einmal, findet die Betroffenen über
 * die E-Mail-Adresse und zieht die richtigen Werte nach. Angefasst wird nur, was
 * nachweislich falsch oder leer ist, vorhandene Angaben bleiben stehen.
 *
 * zyklusStoppen setzt den Einladungszyklus zurück: keine Erinnerung an Tag 7 und
 * 21, keine automatische Löschung an Tag 28. Sinnvoll, wenn die Einladung
 * ungewollt rausging und die Ansprache in Ruhe von Hand laufen soll.
 */
async function repariereAusListe(zeilen, { tenantId, actorId = null, zyklusStoppen = false, ip = null } = {}) {
  const ergebnis = { repariert: [], unveraendert: [], nicht_gefunden: [] };

  for (const zeile of zeilen) {
    const mail = emailKey(zeile.email);
    const vorname = String(zeile.vorname || '').trim();
    const nachname = String(zeile.nachname || '').trim();
    if (!mail || !vorname || !nachname) {
      ergebnis.nicht_gefunden.push({ vorname, nachname, grund: 'ohne E-Mail nicht zuzuordnen' });
      continue;
    }
    const expert = await db('experts').where('tenant_id', tenantId)
      .whereRaw('lower(trim(email)) = ?', [mail]).first();
    if (!expert) {
      ergebnis.nicht_gefunden.push({ vorname, nachname, email: mail, grund: 'kein Profil zu dieser Adresse' });
      continue;
    }

    const patch = {};
    const doppelt = String(expert.nachname || '').trim().toLowerCase() === String(expert.vorname || '').trim().toLowerCase();
    if (doppelt || !expert.nachname) { patch.vorname = vorname.slice(0, 100); patch.nachname = nachname.slice(0, 100); }
    if (!expert.firma && zeile.firma) patch.firma = String(zeile.firma).trim().slice(0, 150);
    if (!expert.berufsbezeichnung && zeile.berufsbezeichnung) patch.berufsbezeichnung = String(zeile.berufsbezeichnung).trim().slice(0, 200);
    if (!expert.linkedin && linkedinKey(zeile.linkedin)) patch.linkedin = linkedinKey(zeile.linkedin);
    if (!expert.vorreg_quelle && zeile.quelle) patch.vorreg_quelle = String(zeile.quelle).trim().slice(0, 150);
    if (!expert.vorreg_prio && zeile.prio) patch.vorreg_prio = String(zeile.prio).trim().toUpperCase().slice(0, 1);
    if (!expert.vorreg_kanal && zeile.kanal) patch.vorreg_kanal = /mail/i.test(zeile.kanal) ? 'email' : 'linkedin';
    if (!expert.vorreg_letzter_kontakt && zeile.letzter_kontakt) patch.vorreg_letzter_kontakt = datumOderNull(zeile.letzter_kontakt);
    const key = nameKey(patch.vorname || expert.vorname, patch.nachname || expert.nachname);
    if (key && key !== expert.name_key) patch.name_key = key;
    if (zyklusStoppen && expert.invite_cycle_started_at) {
      patch.invite_cycle_started_at = null;
      patch.invite_zyklus = null;
    }

    if (!Object.keys(patch).length) {
      ergebnis.unveraendert.push({ vorname, nachname, email: mail, expert_id: expert.id, status: expert.status });
      continue;
    }
    await db('experts').where({ id: expert.id }).update(patch);
    ergebnis.repariert.push({
      expert_id: expert.id, vorname: patch.vorname || expert.vorname, nachname: patch.nachname || expert.nachname,
      email: mail, status: expert.status, name_korrigiert: Boolean(patch.nachname),
      zyklus_gestoppt: Boolean(patch.invite_cycle_started_at === null),
      felder: Object.keys(patch),
    });
  }

  await db('audit_log').insert({
    tenant_id: tenantId, actor_id: actorId, action: 'expert.import_reparatur',
    resource: 'experts',
    new_value_json: JSON.stringify({
      repariert: ergebnis.repariert.length,
      unveraendert: ergebnis.unveraendert.length,
      nicht_gefunden: ergebnis.nicht_gefunden.length,
      zyklus_gestoppt: zyklusStoppen,
    }),
    ip,
  }).catch(() => {});

  return ergebnis;
}

/** Ergebnis der Reparatur als CSV. */
function reparaturCsv(ergebnis) {
  const kopf = ['Vorname', 'Nachname', 'E-Mail', 'Ergebnis', 'Status', 'Experten-ID', 'Geaenderte Felder'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const zeilen = [
    ...ergebnis.repariert.map((r) => [r.vorname, r.nachname, r.email,
      r.name_korrigiert ? 'Name korrigiert' : 'ergaenzt', r.status, r.expert_id, r.felder.join(' ')]),
    ...ergebnis.unveraendert.map((r) => [r.vorname, r.nachname, r.email, 'war schon in Ordnung', r.status, r.expert_id, '']),
    ...ergebnis.nicht_gefunden.map((r) => [r.vorname, r.nachname, r.email || '', r.grund, '', '', '']),
  ];
  return `﻿${kopf.join(';')}\n${zeilen.map((z) => z.map(q).join(';')).join('\n')}\n`;
}

/**
 * Kopfzeile einer Liste deuten. Reihenfolge der Spalten ist egal, E-Mail optional.
 * Die Muster sind absichtlich großzügig, damit auch Exporte mit englischen
 * Überschriften oder kleinen Abweichungen durchgehen.
 */
const SPALTEN = {
  vorname: /^(vorname|first ?name|given ?name)$/,
  nachname: /^(nachname|last ?name|surname|family ?name)$/,
  email: /(e-?mail|mail)/,
  sprache: /^(sprache|language|lang)$/,
  linkedin: /linkedin|profil-?url/,
  firma: /^(firma|unternehmen|company|arbeitgeber)$/,
  berufsbezeichnung: /^(berufsbezeichnung|position|titel|title|rolle|headline)$/,
  quelle: /^(quelle|source)$/,
  prio: /^(prio|prioritaet|priorität|priority)$/,
  kanal: /^(kanal|channel)$/,
  letzter_kontakt: /(letzter kontakt|last contact)/,
};

/**
 * XLSX oder CSV in Zeilenobjekte verwandeln. Erwartet eine Kopfzeile.
 * Liefert { zeilen, erkannt, fehlend }, damit die Oberfläche sagen kann, was in
 * der Datei nicht gefunden wurde.
 */
function leseDatei(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })
    .map((r) => r.map((c) => String(c ?? '').trim()))
    .filter((r) => r.some(Boolean));
  if (!raw.length) return { zeilen: [], erkannt: {}, fehlend: ['Datei ist leer'] };

  const kopf = raw[0].map((c) => c.toLowerCase().trim());
  const idx = {};
  for (const [feld, muster] of Object.entries(SPALTEN)) {
    idx[feld] = kopf.findIndex((c) => muster.test(c));
  }
  const fehlend = ['vorname', 'nachname'].filter((f) => idx[f] < 0);
  if (fehlend.length) return { zeilen: [], erkannt: idx, fehlend };

  const zeilen = raw.slice(1).map((r) => {
    const o = {};
    for (const feld of Object.keys(SPALTEN)) o[feld] = idx[feld] >= 0 ? r[idx[feld]] : '';
    return o;
  }).filter((z) => z.vorname || z.nachname);
  return { zeilen, erkannt: idx, fehlend: [] };
}

/** Ergebnis als CSV mit Semikolon, passend für Excel. */
function ergebnisCsv(ergebnis) {
  const kopf = ['Vorname', 'Nachname', 'LinkedIn', 'Ergebnis', 'Vorhandener Status', 'Experten-ID'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const zeilen = [
    ...ergebnis.angelegt.map((r) => [r.vorname, r.nachname, r.linkedin || '', 'neu vorregistriert', '', r.id]),
    ...ergebnis.vorhanden.map((r) => [r.vorname, r.nachname, r.linkedin || '',
      `bereits vorhanden (erkannt über ${r.erkannt_ueber}${r.mehrdeutig ? ', mehrdeutig' : ''})`, r.status, r.expert_id ?? '']),
    ...(ergebnis.ausgeschlossen || []).map((r) => [r.vorname, r.nachname, r.linkedin || '',
      `übersprungen (nicht ansprechen: ${r.grund})`, '', '']),
    ...ergebnis.fehler.map((r) => [r.vorname || '', r.nachname || '', '', `Fehler: ${r.grund}`, '', '']),
  ];
  return `﻿${kopf.join(';')}\n${zeilen.map((z) => z.map(q).join(';')).join('\n')}\n`;
}

module.exports = {
  VORREG, findePerson, importiereListe, uebernehmen, baueDatensatz, datumOderNull,
  leseDatei, ergebnisCsv, repariereAusListe, reparaturCsv,
  istAusgeschlossen, merkeAusschluss,
};
