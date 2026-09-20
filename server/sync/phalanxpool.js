/**
 * v1.32.0 — Abgleich mit dem Phalanx-OS-Datenpool.
 *
 * Lesen: Kontakte mit den konfigurierten Tags holen und gegen den Bestand
 * abgleichen. Schreiben: Wer hier ankommt, wird dort vermerkt.
 *
 * Zwei Grundsätze, die über allem stehen:
 *
 * Erstens wird nichts gelöscht. Verschwindet ein Kontakt im Pool, bleibt er
 * hier unangetastet. Ein Abgleich, der löschen darf, kann bei einem Fehler auf
 * der Gegenseite einen halben Bestand mitreißen.
 *
 * Zweitens wird nicht geraten. Die Dublettenprüfung läuft über genau dieselbe
 * Funktion, die schon der Listenimport und die Selbstregistrierung benutzen:
 * E-Mail, dann normalisierte LinkedIn-URL, dann Namensschlüssel und der nur
 * bei genau einem Treffer. Damit können die beiden Wege gar nicht auseinander
 * laufen, und es entstehen keine Duplikate zwischen Listenimport und Pool.
 * Mehrdeutige Namen landen in derselben Warteliste "Zuordnung prüfen", die es
 * seit v1.25.0 gibt.
 *
 * Neu angelegte Kontakte bekommen `werbeeinwilligung: false`. Das ist die
 * UWG-Sperre: Die Adressen stammen aus einem LinkedIn-Import und tragen keine
 * Einwilligung nach § 7 UWG. Geprüft wird zentral im Mail-Wrapper.
 */
const { db } = require('../db/knex');
const phalanxOs = require('../utils/phalanxOs');
const { findePerson } = require('../utils/vorregistrierung');
const { nameKey, linkedinKey, emailKey } = require('../utils/normalisieren');

const VORREG = 'vorregistriert';

const TAGS = () => String(process.env.PHALANX_SYNC_TAGS || 'LI:Interim,LI:Berater,LI:CFO/Finance')
  .split(',').map((t) => t.trim()).filter(Boolean);

/* ------------------------- Kontakt lesbar machen ------------------------- */

const feld = (kontakt, name) => {
  const f = kontakt.fields || kontakt.custom_fields || {};
  return f[name] ?? null;
};

/** Die erste Adresse, die eine Werbeeinwilligung hat. Ohne das keine. */
function adresseMitEinwilligung(kontakt) {
  const alle = Array.isArray(kontakt.emails) ? kontakt.emails : [];
  const ohne = new Set((kontakt.emails_ohne_werbeeinwilligung || []).map((e) => String(e).toLowerCase()));
  const raus = (e) => (typeof e === 'string' ? e : e?.address || e?.email || '');
  const mit = alle.map(raus).filter(Boolean).find((e) => !ohne.has(e.toLowerCase()));
  return {
    email: emailKey(mit || alle.map(raus).find(Boolean)),
    werbeeinwilligung: Boolean(mit),
  };
}

function prioAusTags(tags = []) {
  const treffer = tags.find((t) => /^LI:Prio-[ABC]$/i.test(String(t)));
  return treffer ? String(treffer).slice(-1).toUpperCase() : null;
}

/** Aus einem Pool-Kontakt die Felder machen, die wir führen. */
function lesbar(kontakt) {
  const tags = Array.isArray(kontakt.tags) ? kontakt.tags.map(String) : [];
  const position = Array.isArray(kontakt.positions) ? kontakt.positions[0] : null;
  const { email, werbeeinwilligung } = adresseMitEinwilligung(kontakt);
  const telefone = Array.isArray(kontakt.phones) ? kontakt.phones : [];
  const telefon = telefone.map((p) => (typeof p === 'string' ? p : p?.number || p?.phone || '')).find(Boolean) || null;

  return {
    pool_id: String(kontakt.id),
    vorname: String(kontakt.first_name || '').trim().slice(0, 100),
    nachname: String(kontakt.last_name || '').trim().slice(0, 100),
    anrede: kontakt.salutation ? String(kontakt.salutation).toLowerCase().slice(0, 20) : null,
    email,
    werbeeinwilligung,
    telefon: telefon ? String(telefon).slice(0, 40) : null,
    linkedin: linkedinKey(feld(kontakt, 'LinkedIn-Profil')),
    firma: (position?.company || feld(kontakt, 'Firma') || '').toString().trim().slice(0, 150) || null,
    berufsbezeichnung: (feld(kontakt, 'LinkedIn-Position') || position?.title || '').toString().trim().slice(0, 200) || null,
    prio: prioAusTags(tags),
    tags,
    updated_at: kontakt.updated_at || null,
  };
}

/* ------------------------------- Lesen ------------------------------- */

/**
 * Ein Durchlauf. `holen` ist überschreibbar, damit die Tests ohne Netz gegen
 * Fixtures laufen können.
 */
async function sync({ tenantId, ausloeser = 'scheduler', holen = null, vollstaendig = false } = {}) {
  const tags = TAGS();
  const abrufen = holen || ((opts) => phalanxOs.kontakte(opts));

  const [lauf] = await db('phalanx_sync_lauf').insert({
    tenant_id: tenantId, art: 'lesen', ausloeser, tags_json: JSON.stringify(tags),
  }).returning('*');

  const stand = { gelesen: 0, neu: 0, angereichert: 0, mehrdeutig: 0, fehler: 0 };
  let hoechstesUpdate = null;
  let fehlertext = null;

  try {
    // Seit wann? Der letzte erfolgreiche Lauf bestimmt das Fenster. Beim ersten
    // Mal und auf Wunsch wird alles geholt.
    const letzter = vollstaendig ? null : await db('phalanx_sync_lauf')
      .where({ tenant_id: tenantId, art: 'lesen' })
      .whereNotNull('beendet_am').whereNotNull('stand_bis')
      .orderBy('id', 'desc').first();
    const seit = letzter?.stand_bis || null;

    // Ein Kontakt kann mehrere Tags tragen, deshalb je Pool-ID nur einmal verarbeiten.
    const gesehen = new Set();
    for (const tag of tags) {
      const kontakte = await abrufen({ tag, updatedSince: seit });
      for (const roh of kontakte) {
        const k = lesbar(roh);
        if (!k.pool_id || gesehen.has(k.pool_id)) continue;
        gesehen.add(k.pool_id);
        stand.gelesen += 1;
        if (k.updated_at && (!hoechstesUpdate || new Date(k.updated_at) > new Date(hoechstesUpdate))) {
          hoechstesUpdate = k.updated_at;
        }
        try {
          const ergebnis = await verarbeite(k, tenantId, tag);
          if (ergebnis) stand[ergebnis] += 1;
        } catch (e) {
          stand.fehler += 1;
          console.error(`Pool-Kontakt ${k.pool_id} (${k.nachname}):`, e.message);
        }
      }
    }
  } catch (e) {
    fehlertext = e.message;
    stand.fehler += 1;
    console.error('Pool-Sync abgebrochen:', e.message);
  }

  await db('phalanx_sync_lauf').where({ id: lauf.id }).update({
    beendet_am: new Date(),
    ...stand,
    fehlertext,
    // Nur bei einem sauberen Lauf den Stand fortschreiben, sonst würde ein
    // abgebrochener Durchlauf Kontakte für immer überspringen.
    stand_bis: fehlertext ? null : (hoechstesUpdate || new Date()),
  });

  await db('audit_log').insert({
    tenant_id: tenantId, action: 'phalanx.sync_lesen', resource: 'phalanx_sync_lauf',
    resource_id: lauf.id, new_value_json: JSON.stringify({ ...stand, tags }),
  }).catch(() => {});

  return { lauf_id: lauf.id, ...stand, tags, fehlertext };
}

/**
 * Einen einzelnen Kontakt einsortieren. Liefert, was passiert ist:
 * 'neu', 'angereichert', 'mehrdeutig' oder null (nichts zu tun).
 */
async function verarbeite(k, tenantId, tag) {
  if (!k.vorname || !k.nachname) return null;

  // Schon einmal übernommen? Dann ist die Pool-Kennung der kürzeste Weg.
  const ueberKennung = await db('experts')
    .where({ tenant_id: tenantId, pool_contact_id: k.pool_id }).first();
  if (ueberKennung) return anreichern(ueberKennung, k);

  const fund = await findePerson(tenantId, {
    email: k.email, linkedin: k.linkedin, vorname: k.vorname, nachname: k.nachname,
  });

  if (fund.treffer && fund.mehrdeutig) {
    // Nicht raten. Der Fall gehört in die Warteliste, die es dafür gibt.
    await db('audit_log').insert({
      tenant_id: tenantId, action: 'phalanx.sync_mehrdeutig', resource: 'experts',
      new_value_json: JSON.stringify({
        pool_id: k.pool_id, name: `${k.vorname} ${k.nachname}`,
        kandidaten: (fund.kandidaten || []).map((x) => x.id),
      }),
    }).catch(() => {});
    return 'mehrdeutig';
  }

  if (fund.treffer?.id) return anreichern(fund.treffer, k);

  await db('experts').insert({
    tenant_id: tenantId,
    status: VORREG,
    vorname: k.vorname,
    nachname: k.nachname,
    anrede: k.anrede,
    email: k.email,
    telefon: k.telefon,
    linkedin: k.linkedin,
    firma: k.firma,
    berufsbezeichnung: k.berufsbezeichnung,
    name_key: nameKey(k.vorname, k.nachname),
    vorreg_quelle: 'phalanx-pool',
    vorreg_prio: k.prio,
    vorreg_kanal: k.linkedin ? 'linkedin' : (k.email ? 'email' : null),
    vorreg_importiert_am: new Date(),
    ansprache_seit: new Date(),
    pool_contact_id: k.pool_id,
    pool_gesehen_am: new Date(),
    // Der Kern der UWG-Regel: aus dem Pool kommt keine Einwilligung mit.
    werbeeinwilligung: k.werbeeinwilligung,
  });
  return 'neu';
}

/**
 * Vorhandenes Profil ergänzen. Es wird nur gefüllt, was bei uns leer ist.
 * Was ein Mensch hier gepflegt hat, überschreibt der Abgleich nie.
 */
async function anreichern(profil, k) {
  const patch = { pool_contact_id: k.pool_id, pool_gesehen_am: new Date() };
  if (!profil.linkedin && k.linkedin) patch.linkedin = k.linkedin;
  if (!profil.firma && k.firma) patch.firma = k.firma;
  if (!profil.berufsbezeichnung && k.berufsbezeichnung) patch.berufsbezeichnung = k.berufsbezeichnung;
  if (!profil.telefon && k.telefon) patch.telefon = k.telefon;
  if (!profil.anrede && k.anrede) patch.anrede = k.anrede;
  if (!profil.email && k.email) patch.email = k.email;
  if (!profil.name_key) patch.name_key = nameKey(k.vorname, k.nachname);
  if (!profil.vorreg_prio && k.prio) patch.vorreg_prio = k.prio;

  await db('experts').where({ id: profil.id }).update(patch);
  // Nur melden, wenn wirklich etwas dazukam, nicht bei jedem Durchlauf.
  return Object.keys(patch).length > 2 ? 'angereichert' : null;
}

/* ------------------------------ Melden ------------------------------ */

/**
 * Ankünfte zurückmelden.
 *
 * Bewusst als Job und nicht als Haken an jeder Stelle, an der ein Status
 * wechselt. Es gibt davon fünf, und die sechste vergisst man. Der Job findet
 * alle, die angekommen sind und noch nicht gemeldet wurden, und ein
 * Fehlschlag bleibt einfach in der Warteschlange, ohne je einen Nutzerfluss
 * zu blockieren.
 */
async function melde({ tenantId, ausloeser = 'scheduler', senden = null, grenze = 100 } = {}) {
  const upsert = senden || ((d) => phalanxOs.meldeKontakt(d));

  const [lauf] = await db('phalanx_sync_lauf').insert({
    tenant_id: tenantId, art: 'melden', ausloeser,
  }).returning('*');

  const offen = await db('experts')
    .where({ tenant_id: tenantId })
    .whereIn('status', ['registriert', 'freigegeben'])
    .whereNull('pool_gemeldet_am')
    .limit(grenze);

  let gemeldet = 0;
  let fehler = 0;
  let fehlertext = null;

  for (const e of offen) {
    try {
      await upsert({
        source_id: `expert-${e.id}`,
        salutation: e.anrede || null,
        first_name: e.vorname,
        last_name: e.nachname,
        email: e.email || null,
        phone: e.telefon || e.mobil || null,
        title: e.berufsbezeichnung || null,
        company: e.firma ? { source_id: `expert-firma-${e.id}`, name: e.firma } : null,
      });
      await db('experts').where({ id: e.id }).update({ pool_gemeldet_am: new Date() });
      gemeldet += 1;
    } catch (err) {
      fehler += 1;
      fehlertext = err.message;
      console.error(`Rückmeldung für Experte ${e.id} fehlgeschlagen:`, err.message);
    }
  }

  await db('phalanx_sync_lauf').where({ id: lauf.id })
    .update({ beendet_am: new Date(), gemeldet, fehler, fehlertext });

  return { lauf_id: lauf.id, offen: offen.length, gemeldet, fehler };
}

/** Beide Richtungen, wie der Scheduler sie aufruft. */
async function laufAlleMandanten({ ausloeser = 'scheduler' } = {}) {
  if (!phalanxOs.eingerichtet()) return { uebersprungen: 'nicht eingerichtet' };
  const mandanten = await db('tenants').select('id');
  const ergebnis = [];
  for (const t of mandanten) {
    ergebnis.push({
      tenant_id: t.id,
      lesen: await sync({ tenantId: t.id, ausloeser }),
      melden: await melde({ tenantId: t.id, ausloeser }),
    });
  }
  return { mandanten: ergebnis };
}

module.exports = { sync, melde, laufAlleMandanten, lesbar, TAGS, adresseMitEinwilligung, prioAusTags };
