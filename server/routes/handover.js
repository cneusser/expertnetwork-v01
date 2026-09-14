/**
 * v1.27.0 — Übergabe an Capitalmatch.
 *
 * Zwei Wege in dieser Datei, mit bewusst unterschiedlichem Schutz:
 *
 *   Admin (Login):   POST /api/ansprache/:id/uebergabe  erzeugt den Link
 *                    GET  /api/ansprache/uebergaben     zeigt den Stand
 *
 *   Maschine (Key):  GET  /api/handover/:token          Vorbelegung abholen
 *                    POST /api/handover/:token/eingeloest  Rückmeldung
 *
 * Der maschinelle Teil läuft ohne Benutzer-Login, dafür mit dem gemeinsamen
 * Schlüssel HANDOVER_KEY im Header. Ohne gesetzten Schlüssel ist die Strecke
 * geschlossen, nicht offen. Ein vergessener Schlüssel darf nie ein Datenleck
 * bedeuten.
 *
 * In der URL steht ausschließlich eine Zufallskennung. Name, Firma und Position
 * wandern nie über die Adresszeile, sondern nur über den Abruf von Server zu
 * Server. Der Abruf ist auf 30 Tage und den Ablauf des Tokens begrenzt.
 */
const express = require('express');
const crypto = require('crypto');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ZIELGRUPPEN = ['interim', 'cfo', 'nachfolger'];
const GUELTIG_TAGE = Number(process.env.HANDOVER_GUELTIG_TAGE || 7);

function capitalmatchBasis() {
  return (process.env.CAPITALMATCH_URL || 'https://capitalmatch.phalanx.de').replace(/\/+$/, '');
}

/** Gleich langer Vergleich, damit der Schlüssel nicht Zeichen für Zeichen erraten werden kann. */
function schluesselStimmt(eingang) {
  const soll = process.env.HANDOVER_KEY || '';
  if (!soll || !eingang) return false;
  const a = Buffer.from(String(eingang));
  const b = Buffer.from(soll);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ============================ Maschine ============================ */

function nurMitSchluessel(req, res, next) {
  if (!process.env.HANDOVER_KEY) {
    return res.status(503).json({ error: 'Übergabe ist nicht eingerichtet (HANDOVER_KEY fehlt)' });
  }
  if (!schluesselStimmt(req.get('X-Handover-Key'))) {
    return res.status(401).json({ error: 'Nicht berechtigt' });
  }
  return next();
}

/**
 * Vorbelegung abholen. Liefert genau die Felder, die Capitalmatch für seine
 * Registrierung braucht, nicht mehr. Keine Tagessätze, keine Notizen, keine
 * internen Vermerke.
 */
router.get('/handover/:token', nurMitSchluessel, async (req, res) => {
  const eintrag = await db('handover_tokens').where({ token: String(req.params.token) }).first();
  if (!eintrag) return res.status(404).json({ error: 'Unbekannte Kennung' });
  if (new Date(eintrag.expires_at) < new Date()) return res.status(410).json({ error: 'Kennung abgelaufen' });

  const person = await db('experts').where({ id: eintrag.expert_id }).first();
  if (!person) return res.status(404).json({ error: 'Datensatz nicht mehr vorhanden' });

  await db('handover_tokens').where({ id: eintrag.id }).update({ abgerufen_at: db.fn.now() });
  await db('audit_log').insert({
    tenant_id: eintrag.tenant_id, action: 'expert.uebergabe_abgerufen',
    resource: 'experts', resource_id: person.id,
    new_value_json: JSON.stringify({ ziel: eintrag.ziel }),
  }).catch(() => {});

  res.json({
    ok: true,
    ziel: eintrag.ziel,
    gueltig_bis: eintrag.expires_at,
    person: {
      anrede: person.anrede || null,
      titel: person.titel || null,
      vorname: person.vorname,
      nachname: person.nachname,
      email: person.email || null,
      firma: person.firma || null,
      position: person.berufsbezeichnung || null,
      linkedin: person.linkedin || null,
      herkunft: 'Phalanx Expert Network',
    },
  });
});

/** Capitalmatch meldet zurück, dass sich die Person dort registriert hat. */
router.post('/handover/:token/eingeloest', nurMitSchluessel, async (req, res) => {
  const eintrag = await db('handover_tokens').where({ token: String(req.params.token) }).first();
  if (!eintrag) return res.status(404).json({ error: 'Unbekannte Kennung' });
  if (eintrag.eingeloest_at) return res.json({ ok: true, message: 'War schon vermerkt.' });

  await db('handover_tokens').where({ id: eintrag.id }).update({ eingeloest_at: db.fn.now() });
  await db('experts').where({ id: eintrag.expert_id })
    .update({ vorreg_reaktion: 'interesse', vorreg_reaktion_am: db.fn.now(), vorreg_wiedervorlage: null });
  await db('audit_log').insert({
    tenant_id: eintrag.tenant_id, action: 'expert.uebergabe_eingeloest',
    resource: 'experts', resource_id: eintrag.expert_id,
    new_value_json: JSON.stringify({ ziel: eintrag.ziel }),
  }).catch(() => {});

  res.json({ ok: true, message: 'Vermerkt, die Person ist in der Ansprache als Interesse gesetzt.' });
});

/* ============================ Admin ============================ */

router.use(requireAuth, requireRole('admin'));

/** Zielgruppe setzen. Steuert, wohin die Ansprache führt. */
router.put('/ansprache/:id(\\d+)/zielgruppe', async (req, res) => {
  const wert = String(req.body?.zielgruppe || '').toLowerCase();
  if (wert && !ZIELGRUPPEN.includes(wert)) return res.status(400).json({ error: 'Unbekannte Zielgruppe' });
  const person = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!person) return res.status(404).json({ error: 'Kontakt nicht gefunden' });

  await db('experts').where({ id: person.id }).update({ zielgruppe: wert || null });
  await req.audit({ action: 'expert.zielgruppe', resource: 'experts', resourceId: person.id, newValue: { zielgruppe: wert || null } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: wert ? `Als ${wert} markiert.` : 'Zielgruppe entfernt.' });
});

/**
 * Übergabelink erzeugen. Wiederholter Aufruf liefert einen noch gültigen Link
 * zurück, statt einen zweiten auszustellen. So bleibt der Link, den Christian
 * schon verschickt hat, gültig.
 */
router.post('/ansprache/:id(\\d+)/uebergabe', async (req, res) => {
  const person = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!person) return res.status(404).json({ error: 'Kontakt nicht gefunden' });
  if (!person.vorname || !person.nachname) return res.status(400).json({ error: 'Ohne Namen keine Übergabe' });

  const offen = await db('handover_tokens')
    .where({ expert_id: person.id, ziel: 'capitalmatch' })
    .where('expires_at', '>', new Date()).orderBy('id', 'desc').first();

  let eintrag = offen;
  if (!eintrag) {
    const token = crypto.randomBytes(24).toString('base64url');
    [eintrag] = await db('handover_tokens').insert({
      tenant_id: req.user.tenantId, expert_id: person.id, ziel: 'capitalmatch', token,
      expires_at: new Date(Date.now() + GUELTIG_TAGE * 86400000), created_by: req.user.id,
    }).returning('*');
  }
  if (person.zielgruppe !== 'nachfolger') {
    await db('experts').where({ id: person.id }).update({ zielgruppe: 'nachfolger' });
  }

  await req.audit({
    action: 'expert.uebergabe_erzeugt', resource: 'experts', resourceId: person.id,
    newValue: { ziel: 'capitalmatch', gueltig_bis: eintrag.expires_at, neu: !offen },
  });
  res.locals.auditLogged = true;
  res.json({
    ok: true,
    link: `${capitalmatchBasis()}/start?u=${eintrag.token}`,
    gueltig_bis: eintrag.expires_at,
    wiederverwendet: Boolean(offen),
    message: offen
      ? 'Es gab schon einen gültigen Link, den bekommst Du wieder.'
      : `Link erzeugt, gültig bis ${new Date(eintrag.expires_at).toLocaleDateString('de-DE')}.`,
  });
});

/** Stand aller Übergaben. */
router.get('/ansprache/uebergaben', async (req, res) => {
  const rows = await db('handover_tokens as h')
    .join('experts as e', 'e.id', 'h.expert_id')
    .where('h.tenant_id', req.user.tenantId)
    .orderBy('h.id', 'desc')
    .select('h.id', 'h.ziel', 'h.expires_at', 'h.abgerufen_at', 'h.eingeloest_at', 'h.created_at',
      'e.id as expert_id', 'e.vorname', 'e.nachname', 'e.firma', 'e.zielgruppe');
  res.json({
    uebergaben: rows,
    zahlen: {
      gesamt: rows.length,
      abgerufen: rows.filter((r) => r.abgerufen_at).length,
      eingeloest: rows.filter((r) => r.eingeloest_at).length,
      abgelaufen: rows.filter((r) => !r.eingeloest_at && new Date(r.expires_at) < new Date()).length,
    },
    eingerichtet: Boolean(process.env.HANDOVER_KEY),
  });
});

module.exports = router;
