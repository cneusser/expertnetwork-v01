/**
 * v1.41.0 — Adressverwaltung: Vorschläge sehen, übernehmen, verwerfen.
 *
 * Der Zerleger schlägt vor, hier entscheidet ein Mensch. Es gibt bewusst
 * keinen Knopf "alle sicheren übernehmen, egal welche": Die sicheren kann man
 * gesammelt übernehmen, die gemeldeten nie, und beides steht getrennt da.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { lauf, uebernehmen, verwerfen } = require('../utils/adresseLauf');
const { anzeigeZeilen } = require('../utils/adresse');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Was ein Lauf ergäbe, ohne irgendetwas zu verändern. */
router.get('/trockenlauf', async (req, res) => {
  res.json(await lauf({ db, tenantId: req.user.tenantId, schreiben: false }));
});

/** Derselbe Lauf, diesmal werden die Vorschläge abgelegt. */
router.post('/lauf', async (req, res) => {
  const e = await lauf({ db, tenantId: req.user.tenantId, schreiben: true });
  await req.audit({
    action: 'adresse.vorschlagslauf', resource: 'adresse_vorschlag',
    newValue: { geprueft: e.geprueft, sicher: e.sicher, gemeldet: e.gemeldet },
  });
  res.locals.auditLogged = true;
  res.json({
    ok: true, ...e,
    message: `${e.geprueft} geprüft: ${e.sicher} sicher zerlegt, ${e.gemeldet} zum Ansehen.`,
  });
});

/** Die offenen Vorschläge, getrennt nach sicher und zu melden. */
router.get('/vorschlaege', async (req, res) => {
  const roh = await db('adresse_vorschlag')
    .where({ tenant_id: req.user.tenantId, status: req.query.status || 'offen' })
    .orderBy([{ column: 'einstufung', order: 'asc' }, { column: 'id', order: 'asc' }])
    .limit(500);

  // Die Namen dazu, damit in der Liste nicht nur Nummern stehen.
  const expertIds = roh.filter((v) => v.subjekt_typ === 'expert').map((v) => v.subjekt_id);
  const kundeIds = roh.filter((v) => v.subjekt_typ === 'kunde').map((v) => v.subjekt_id);
  const experten = expertIds.length
    ? await db('experts').whereIn('id', expertIds).select('id', 'vorname', 'nachname', 'firma') : [];
  const kunden = kundeIds.length
    ? await db('vendor_profiles').whereIn('id', kundeIds).select('id', 'firmenname') : [];
  const nameVon = (v) => {
    if (v.subjekt_typ === 'expert') {
      const e = experten.find((x) => x.id === v.subjekt_id);
      return e ? [e.firma, `${e.vorname} ${e.nachname}`].filter(Boolean).join(' · ') : `#${v.subjekt_id}`;
    }
    const k = kunden.find((x) => x.id === v.subjekt_id);
    return k ? k.firmenname : `#${v.subjekt_id}`;
  };

  const vorschlaege = roh.map((v) => {
    const felder = typeof v.vorschlag_json === 'string' ? JSON.parse(v.vorschlag_json || '{}') : (v.vorschlag_json || {});
    return { ...v, vorschlag: felder, anzeige: anzeigeZeilen(felder), name: nameVon(v) };
  });

  res.json({
    sicher: vorschlaege.filter((v) => v.einstufung === 'sicher'),
    gemeldet: vorschlaege.filter((v) => v.einstufung !== 'sicher'),
  });
});

router.post('/vorschlaege/:id/uebernehmen', async (req, res) => {
  const r = await uebernehmen({ db, tenantId: req.user.tenantId, vorschlagId: req.params.id, benutzerId: req.user.id });
  if (!r.ok) return res.status(400).json({ error: r.grund });
  await req.audit({
    action: 'adresse.vorschlag_uebernommen', resource: r.typ === 'expert' ? 'expert' : 'vendor_profile',
    resourceId: r.id, newValue: r.felder,
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Adresse übernommen.' });
});

router.post('/vorschlaege/:id/verwerfen', async (req, res) => {
  const r = await verwerfen({ db, tenantId: req.user.tenantId, vorschlagId: req.params.id, benutzerId: req.user.id });
  if (!r.ok) return res.status(404).json({ error: 'Vorschlag nicht gefunden oder schon entschieden' });
  res.json({ ok: true, message: 'Vorschlag verworfen.' });
});

/**
 * Alle sicheren auf einmal übernehmen.
 *
 * Nur die sicheren. Für die gemeldeten gibt es diesen Weg bewusst nicht:
 * Sie sind gemeldet, weil jemand hinsehen muss.
 */
router.post('/vorschlaege/sichere-uebernehmen', async (req, res) => {
  const offene = await db('adresse_vorschlag')
    .where({ tenant_id: req.user.tenantId, status: 'offen', einstufung: 'sicher' }).select('id');

  let n = 0; const fehler = [];
  for (const v of offene) {
    const r = await uebernehmen({ db, tenantId: req.user.tenantId, vorschlagId: v.id, benutzerId: req.user.id });
    if (r.ok) n += 1; else fehler.push(r.grund);
  }
  await req.audit({ action: 'adresse.sichere_uebernommen', resource: 'adresse_vorschlag', newValue: { anzahl: n } });
  res.locals.auditLogged = true;
  res.json({ ok: true, uebernommen: n, fehler, message: `${n} Adressen übernommen.` });
});

module.exports = router;
