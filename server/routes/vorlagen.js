/**
 * v1.43.0 — Vorlagen: Profile zu einer Anfrage zusammenstellen und zeigen.
 *
 * Zwei Zugänge in einer Datei, weil sie dasselbe betreffen:
 *   Admin        anlegen, bearbeiten, versenden, als PDF oder PPTX holen
 *   öffentlich   die Ansicht unter dem Token, ohne Konto
 *
 * Die öffentliche Seite sieht nur, was in der Vorlage eingefroren wurde. Sie
 * fragt nie das Profil ab: Was einmal verschickt wurde, bleibt, wie es
 * verschickt wurde.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const vorlagen = require('../utils/vorlage');
const { buildOnePager, buildVorlagePdf } = require('../utils/vorlagePdf');
const { erzeuge: erzeugeKurzprofil } = require('../utils/kurzprofil');

const router = express.Router();

/* =========================== Öffentlich =================================== */

/**
 * Die Ansicht unter dem Token.
 *
 * Kein Konto, kein Login. Der Token ist 24 zufällige Bytes und steht in
 * keiner Suchmaschine, weil die Seite nicht verlinkt ist. Für eine
 * Profilübersicht ohne Klardaten ist das die richtige Abwägung: Ein
 * Anmeldezwang würde dazu führen, dass niemand hineinsieht.
 */
router.get('/oeffentlich/:token', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v) return res.status(404).json({ error: 'Diese Übersicht gibt es nicht.' });
  if (v.status === 'entwurf') return res.status(404).json({ error: 'Diese Übersicht ist noch nicht freigegeben.' });
  if (v.gueltig_bis && new Date(v.gueltig_bis) < new Date()) {
    return res.status(410).json({ error: 'Dieser Link ist abgelaufen. Bitte melden Sie sich bei uns.' });
  }
  res.json(await vorlagen.fuerEmpfaenger(db, v));
});

/** Ein Profil als One-Pager, DIN A4. */
router.get('/oeffentlich/:token/profil/:positionId(\\d+).pdf', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v || v.status === 'entwurf') return res.status(404).json({ error: 'Nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const profil = daten.profile.find((p) => p.id === Number(req.params.positionId));
  if (!profil) return res.status(404).json({ error: 'Profil nicht gefunden' });

  const doc = buildOnePager({ profil, projekt: daten.projekt });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename="${dateiname(daten.projekt.name, profil.kennung)}.pdf"`);
  doc.pipe(res); doc.end();
});

/** Alle Profile in einem PDF. */
router.get('/oeffentlich/:token/alle.pdf', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v || v.status === 'entwurf') return res.status(404).json({ error: 'Nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const doc = buildVorlagePdf({ vorlage: v, projekt: daten.projekt, profile: daten.profile });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dateiname(daten.projekt.name, 'Profile')}.pdf"`);
  doc.pipe(res); doc.end();
});

function dateiname(...teile) {
  return teile.join('-').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

/* ============================== Verwaltung ================================ */

router.use(requireAuth, requireRole('admin'));

const anlegen = z.object({
  project_id: z.number().int(),
  expert_ids: z.array(z.number().int()).min(1).max(12),
  empfaenger: z.object({
    vendor_user_id: z.number().int().nullable().optional(),
    firma: z.string().max(200).nullable().optional(),
    name: z.string().max(200).nullable().optional(),
    email: z.string().email().nullable().optional(),
  }).optional(),
  aufschlag_prozent: z.number().int().min(0).max(200).nullable().optional(),
  anschreiben: z.string().max(3000).nullable().optional(),
  gueltig_tage: z.number().int().min(1).max(365).optional(),
});

/** Eine Vorlage bauen. Entsteht als Entwurf, der Link greift noch nicht. */
router.post('/', async (req, res) => {
  const parsed = anlegen.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte Projekt und mindestens ein Profil wählen.' });
  const d = parsed.data;

  const projekt = await db('projects').where({ id: d.project_id, tenant_id: req.user.tenantId }).first();
  if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  const v = await vorlagen.baue(db, {
    tenantId: req.user.tenantId,
    projekt,
    expertIds: d.expert_ids,
    empfaenger: d.empfaenger || {},
    aufschlag: d.aufschlag_prozent ?? null,
    anschreiben: d.anschreiben || null,
    gueltigTage: d.gueltig_tage ?? 30,
    benutzerId: req.user.id,
  });

  const positionen = await db('vorlage_positionen').where({ vorlage_id: v.id }).orderBy('sortierung');
  await req.audit({
    action: 'vorlage.angelegt', resource: 'vorlage', resourceId: v.id,
    newValue: { projekt: projekt.name, profile: positionen.length, aufschlag: v.aufschlag_prozent },
  });
  res.locals.auditLogged = true;

  res.status(201).json({
    ok: true, vorlage: v, positionen,
    message: `${positionen.length} Profile zusammengestellt, Aufschlag ${v.aufschlag_prozent} Prozent. Bitte prüfen und dann freigeben.`,
  });
});

/** Die Vorlage im Admin, mit allem, auch dem Einkaufssatz. */
router.get('/:id(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const positionen = await db('vorlage_positionen as p')
    .join('experts as e', 'e.id', 'p.expert_id')
    .where('p.vorlage_id', v.id)
    .orderBy('p.sortierung')
    .select('p.*', 'e.vorname', 'e.nachname', 'e.firma');
  const projekt = await db('projects').where({ id: v.project_id }).first();

  res.json({
    vorlage: v, projekt,
    positionen: positionen.map((p) => ({
      ...p,
      profil: typeof p.profil_json === 'string' ? JSON.parse(p.profil_json || '{}') : (p.profil_json || {}),
      marge_cent: (p.satz_kunde_cent || 0) - (p.satz_experte_cent || 0),
    })),
    link: v.status === 'entwurf' ? null : oeffentlicherLink(req, v.token),
  });
});

/** Alle Vorlagen zu einem Projekt. */
router.get('/', async (req, res) => {
  const q = db('vorlagen').where({ tenant_id: req.user.tenantId });
  if (req.query.project_id) q.andWhere('project_id', Number(req.query.project_id));
  const liste = await q.orderBy('id', 'desc').limit(100);

  const ids = liste.map((v) => v.id);
  const zahlen = ids.length
    ? await db('vorlage_positionen').whereIn('vorlage_id', ids)
      .select('vorlage_id', 'reaktion').then((r) => r)
    : [];

  res.json({
    vorlagen: liste.map((v) => {
      const meine = zahlen.filter((z) => z.vorlage_id === v.id);
      return {
        ...v,
        profile: meine.length,
        reaktionen: {
          gemerkt: meine.filter((m) => m.reaktion === 'gemerkt').length,
          einladen: meine.filter((m) => m.reaktion === 'einladen').length,
          abgelehnt: meine.filter((m) => m.reaktion === 'abgelehnt').length,
        },
      };
    }),
  });
});

/** Kurzprofil oder Fitting einer Position ändern, vor dem Versand. */
router.put('/:id(\\d+)/positionen/:posId(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const patch = {};
  for (const f of ['kurzprofil', 'fitting']) {
    if (typeof req.body[f] === 'string') patch[f] = req.body[f].slice(0, 6000);
  }
  if (req.body.satz_kunde_cent !== undefined) {
    patch.satz_kunde_cent = req.body.satz_kunde_cent === null ? null : Number(req.body.satz_kunde_cent);
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nichts zu ändern' });

  const n = await db('vorlage_positionen').where({ id: req.params.posId, vorlage_id: v.id }).update(patch);
  if (!n) return res.status(404).json({ error: 'Position nicht gefunden' });
  res.json({ ok: true, message: 'Gespeichert.' });
});

/** Eine Position aus der Vorlage nehmen. */
router.delete('/:id(\\d+)/positionen/:posId(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  if (v.status !== 'entwurf') {
    return res.status(409).json({ error: 'Die Vorlage ist schon verschickt. Eine verschickte Übersicht ändert sich nicht mehr.' });
  }
  await db('vorlage_positionen').where({ id: req.params.posId, vorlage_id: v.id }).del();
  res.json({ ok: true, message: 'Entfernt.' });
});

/**
 * Die Vorlage freigeben: Ab jetzt trägt der Link.
 *
 * Verschickt wird hier noch nichts. Den Link gibst du weiter, wie du willst,
 * per Mail, im Gespräch, im Chat des Vermittlers.
 */
router.post('/:id(\\d+)/freigeben', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const anzahl = Number((await db('vorlage_positionen').where({ vorlage_id: v.id }).count('* as n').first()).n);
  if (!anzahl) return res.status(400).json({ error: 'Die Vorlage enthält kein Profil.' });

  await db('vorlagen').where({ id: v.id }).update({ status: 'versendet', versendet_am: new Date() });
  await req.audit({
    action: 'vorlage.freigegeben', resource: 'vorlage', resourceId: v.id,
    newValue: { profile: anzahl, empfaenger: v.empfaenger_firma || v.empfaenger_email },
  });
  res.locals.auditLogged = true;

  res.json({
    ok: true, link: oeffentlicherLink(req, v.token),
    message: 'Der Link ist jetzt gültig. Du kannst ihn weitergeben.',
  });
});

/** Ein Kurzprofil neu erzeugen, ausdrücklich. */
router.post('/kurzprofil/:expertId(\\d+)', async (req, res) => {
  const e = await db('experts').where({ id: req.params.expertId, tenant_id: req.user.tenantId }).first();
  if (!e) return res.status(404).json({ error: 'Experte nicht gefunden' });

  const { text, grund } = await erzeugeKurzprofil(db, e);
  if (!text) return res.status(400).json({ error: grund || 'Es ließ sich kein Kurzprofil bauen.' });

  await db('experts').where({ id: e.id }).update({
    kurzprofil_anonym: text, kurzprofil_anonym_am: new Date(), kurzprofil_anonym_gepflegt: false,
  });
  res.json({ ok: true, kurzprofil: text, message: 'Kurzprofil neu erzeugt. Bitte durchlesen.' });
});

/** Ein Kurzprofil von Hand setzen. Ab dann gilt es als gepflegt. */
router.put('/kurzprofil/:expertId(\\d+)', async (req, res) => {
  const text = String(req.body?.kurzprofil || '').slice(0, 6000);
  if (!text.trim()) return res.status(400).json({ error: 'Kein Text' });

  const n = await db('experts').where({ id: req.params.expertId, tenant_id: req.user.tenantId }).update({
    kurzprofil_anonym: text, kurzprofil_anonym_am: new Date(), kurzprofil_anonym_gepflegt: true,
  });
  if (!n) return res.status(404).json({ error: 'Experte nicht gefunden' });
  res.json({ ok: true, message: 'Gespeichert. Das Kurzprofil wird nicht mehr automatisch überschrieben.' });
});

function oeffentlicherLink(req, token) {
  const basis = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get('host')}`);
  return `${basis.replace(/\/+$/, '')}/profile/${token}`;
}

module.exports = router;
