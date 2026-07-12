const express = require('express');
const multer = require('multer');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const storage = require('../providers/storage');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Nur PDF erlaubt')),
});

/** Aktuelle Verfügbarkeit + aktuelle Sätze je Experte anreichern. */
async function enrich(expertIds) {
  if (!expertIds.length) return { avail: {}, rates: {} };
  const avails = await db('availabilities')
    .whereIn('expert_id', expertIds)
    .orderBy([{ column: 'expert_id' }, { column: 'ab_datum', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
  const rates = await db('rates')
    .whereIn('expert_id', expertIds)
    .orderBy([{ column: 'expert_id' }, { column: 'kategorie' }, { column: 'created_at', order: 'desc' }]);
  const avail = {};
  for (const a of avails) (avail[a.expert_id] = avail[a.expert_id] || []).push(a);
  const rateMap = {};
  for (const r of rates) {
    rateMap[r.expert_id] = rateMap[r.expert_id] || {};
    if (!rateMap[r.expert_id][r.kategorie]) rateMap[r.expert_id][r.kategorie] = r; // jüngste je Kategorie
  }
  return { avail, rates: rateMap };
}

/** Liste (Admin). */
router.get('/', requireRole('admin'), async (req, res) => {
  const experts = await db('experts').where({ tenant_id: req.user.tenantId }).orderBy('nachname');
  const ids = experts.map((e) => e.id);
  const skills = ids.length
    ? await db('expert_skills')
        .join('skills', 'skills.id', 'expert_skills.skill_id')
        .whereIn('expert_id', ids)
        .select('expert_id', 'skills.name', 'skills.kategorie')
    : [];
  const { avail, rates } = await enrich(ids);
  res.json({
    experts: experts.map((e) => ({
      ...e,
      skills: skills.filter((s) => s.expert_id === e.id),
      availabilities: avail[e.id] || [],
      rates: Object.values(rates[e.id] || {}),
    })),
  });
});

/** Eigenes Profil (Experte). */
router.get('/me', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  req.params.id = expert.id;
  return detail(req, res, expert);
});

/** Detail (Admin oder Inhaber). */
router.get('/:id(\\d+)', async (req, res) => {
  const expert = await db('experts')
    .where({ id: Number(req.params.id), tenant_id: req.user.tenantId })
    .first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  if (req.user.role !== 'admin' && expert.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  return detail(req, res, expert);
});

async function detail(req, res, expert) {
  const [skills, documents, availabilities, rates, consent] = await Promise.all([
    db('expert_skills')
      .join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', expert.id)
      .select('skills.id', 'skills.name', 'skills.kategorie', 'expert_skills.level', 'expert_skills.jahre'),
    db('documents').where({ expert_id: expert.id }).orderBy([{ column: 'kategorie' }, { column: 'version', order: 'desc' }]),
    db('availabilities').where({ expert_id: expert.id }).orderBy('ab_datum', 'asc'),
    db('rates').where({ expert_id: expert.id }).orderBy('created_at', 'desc'),
    expert.user_id
      ? db('consents').where({ user_id: expert.user_id, zweck: 'talentpool' }).whereNull('revoked_at').orderBy('granted_at', 'desc').first()
      : null,
  ]);
  res.json({
    expert,
    skills,
    documents: documents.map(({ storage_ref, ...d }) => d), // interne Pfade nicht leaken
    availabilities,
    rates,
    consent: consent
      ? { granted_at: consent.granted_at, expires_at: consent.expires_at, text_version: consent.text_version }
      : null,
  });
}

/** Dokument herunterladen (Admin oder Inhaber) — der "Tresor"-Zugriff. */
router.get('/:id(\\d+)/documents/:docId(\\d+)/download', async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  if (req.user.role !== 'admin' && expert.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  const doc = await db('documents').where({ id: Number(req.params.docId), expert_id: expert.id }).first();
  if (!doc || !storage.exists(doc.storage_ref)) {
    return res.status(404).json({ error: 'Dokument nicht gefunden' });
  }
  await req.audit({ action: 'document.download', resource: 'documents', resourceId: doc.id });
  res.setHeader('Content-Type', doc.mimetype || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
  storage.createReadStream(doc.storage_ref).pipe(res);
});

/** Dokument hochladen (Admin) — neue Version, nie überschreiben. */
router.post('/:id(\\d+)/documents', requireRole('admin'), upload.single('file'), async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  if (!req.file) return res.status(400).json({ error: 'Datei fehlt' });
  const kategorie = String(req.body.kategorie || 'referenz');
  const last = await db('documents').where({ expert_id: expert.id, kategorie }).max('version as v').first();
  const version = (last?.v || 0) + 1;
  const relPath = `experts/${expert.id}/${kategorie}-v${version}-${Date.now()}.pdf`;
  await storage.save(relPath, req.file.buffer);
  const [doc] = await db('documents')
    .insert({
      tenant_id: req.user.tenantId,
      expert_id: expert.id,
      kategorie,
      sprache: req.body.sprache || null,
      filename: req.file.originalname,
      version,
      storage_ref: relPath,
      mimetype: req.file.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
    })
    .returning(['id', 'kategorie', 'filename', 'version']);
  await req.audit({ action: 'document.upload', resource: 'documents', resourceId: doc.id, newValue: doc });
  res.status(201).json({ ok: true, document: doc });
});

module.exports = router;
