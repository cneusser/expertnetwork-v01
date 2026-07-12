const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const storage = require('../providers/storage');
const { signPurposeToken } = require('../utils/tokens');
const { getMailProvider } = require('../providers/mail');
const { inviteMail } = require('../providers/mail/templates');
const { freshness } = require('../utils/freshness');

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

/** Frische-Score je Experte (dynamisch, nie gespeichert). */
async function freshnessFor(expertId, avails) {
  const latestAvail = (avails || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const latestRate = await db('rates').where({ expert_id: expertId }).orderBy('created_at', 'desc').first();
  const latestCv = await db('documents').where({ expert_id: expertId, kategorie: 'cv' }).orderBy('uploaded_at', 'desc').first();
  return freshness({
    availabilityConfirmedAt: latestAvail?.confirmed_at,
    rateCreatedAt: latestRate?.created_at,
    cvUploadedAt: latestCv?.uploaded_at,
  });
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
    experts: await Promise.all(experts.map(async (e) => ({
      ...e,
      skills: skills.filter((s) => s.expert_id === e.id),
      availabilities: avail[e.id] || [],
      rates: Object.values(rates[e.id] || {}),
      freshness: await freshnessFor(e.id, avail[e.id]),
    }))),
  });
});

/** Dashboard-Kennzahlen (Admin). */
router.get('/stats', requireRole('admin'), async (req, res) => {
  const experts = await db('experts').where({ tenant_id: req.user.tenantId });
  const today = new Date().toISOString().slice(0, 10);
  let verfuegbarJetzt = 0;
  let nichtBestaetigt = 0;
  let consentFehlt = 0;
  for (const e of experts) {
    const avails = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc');
    const f = await freshnessFor(e.id, avails);
    if (f.nichtBestaetigt) nichtBestaetigt++;
    const current = avails.find((a) => !a.ab_datum || new Date(a.ab_datum).toISOString().slice(0, 10) <= today) || avails[0];
    if (current && ['sofort', 'teilweise'].includes(current.status) && !f.nichtBestaetigt) verfuegbarJetzt++;
    const consent = e.user_id
      ? await db('consents').where({ user_id: e.user_id, zweck: 'talentpool' }).whereNull('revoked_at').orderBy('expires_at', 'desc').first()
      : null;
    if (!consent || new Date(consent.expires_at) < new Date()) consentFehlt++;
  }
  res.json({ gesamt: experts.length, verfuegbarJetzt, nichtBestaetigt, consentFehlt });
});

/**
 * Einladung + Art.-14-Information versenden (Admin).
 * Der Experte erhält transparent die Info, dass sein Profil angelegt wurde,
 * und kann Einwilligung erteilen + Passwort vergeben (Self-Service).
 */
router.post('/:id(\\d+)/invite', requireRole('admin'), async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  if (!expert.user_id || !expert.email) return res.status(400).json({ error: 'Kein Benutzerkonto/E-Mail hinterlegt' });
  const token = signPurposeToken(expert.user_id, 'expert-invite', '14d');
  try {
    await getMailProvider().send({ to: expert.email, ...inviteMail(token, expert.vorname) });
  } catch (e) {
    console.error('Mail-Versand fehlgeschlagen (Einladung):', e.message);
    return res.status(502).json({ error: `E-Mail-Versand fehlgeschlagen: ${e.message}` });
  }
  await req.audit({ action: 'expert.invite_sent', resource: 'experts', resourceId: expert.id });
  res.json({ ok: true, message: `Einladung an ${expert.email} versendet.` });
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

/* ============================== Sprint 4: Audit & DSGVO ============================== */

/** Änderungsverlauf eines Experten (Admin) — über alle verknüpften Ressourcen. */
router.get('/:id(\\d+)/audit', requireRole('admin'), async (req, res) => {
  const expertId = Number(req.params.id);
  const expert = await db('experts').where({ id: expertId, tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const rows = await db('audit_log as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .where('a.tenant_id', req.user.tenantId)
    .whereNot('a.action', 'auth.login')
    .where(function () {
      this.where(function () { this.where('a.resource', 'experts').andWhere('a.resource_id', expertId); })
        .orWhere(function () { this.where('a.resource', 'rates').whereIn('a.resource_id', db('rates').select('id').where('expert_id', expertId)); })
        .orWhere(function () { this.where('a.resource', 'documents').whereIn('a.resource_id', db('documents').select('id').where('expert_id', expertId)); })
        .orWhere(function () { this.where('a.resource', 'availabilities').whereIn('a.resource_id', db('availabilities').select('id').where('expert_id', expertId)); });
      if (expert.user_id) {
        this.orWhere(function () { this.whereIn('a.resource', ['users', 'consents']).andWhere('a.actor_id', expert.user_id); });
      }
    })
    .select('a.*', 'u.email as actor_email')
    .orderBy('a.ts', 'desc')
    .limit(300);
  res.json({ rows });
});

/** DSGVO-Datenexport (Art. 20) — ZIP mit Profil-JSON und allen Dokumenten. */
router.get('/me/export', async (req, res) => {
  const archiver = require('archiver');
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const [skills, documents, availabilities, rates, consents] = await Promise.all([
    db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id').where('expert_id', expert.id).select('skills.name', 'skills.kategorie'),
    db('documents').where({ expert_id: expert.id }),
    db('availabilities').where({ expert_id: expert.id }),
    db('rates').where({ expert_id: expert.id }),
    db('consents').where({ user_id: req.user.id }),
  ]);
  await req.audit({ action: 'expert.data_export', resource: 'experts', resourceId: expert.id });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="meine-daten-phalanx-expert-network.zip"');
  const zip = archiver('zip');
  zip.pipe(res);
  const { storage_refs, docsMeta } = documents.reduce(
    (acc, d) => {
      acc.storage_refs.push(d);
      const { storage_ref, ...meta } = d;
      acc.docsMeta.push(meta);
      return acc;
    },
    { storage_refs: [], docsMeta: [] }
  );
  zip.append(
    JSON.stringify({ profil: expert, skills, verfuegbarkeiten: availabilities, tagessaetze: rates, einwilligungen: consents, dokumente: docsMeta }, null, 2),
    { name: 'meine-daten.json' }
  );
  for (const d of storage_refs) {
    if (storage.exists(d.storage_ref)) zip.append(storage.createReadStream(d.storage_ref), { name: `dokumente/${d.kategorie}-v${d.version}-${d.filename}` });
  }
  await zip.finalize();
});

/* ============================== Sprint 3: Pflege ============================== */

const profileSchema = z.object({
  vorname: z.string().min(1).max(100).optional(),
  nachname: z.string().min(1).max(100).optional(),
  firma: z.string().max(150).nullable().optional(),
  berufsbezeichnung: z.string().max(200).nullable().optional(),
  kurzprofil: z.string().max(3000).nullable().optional(),
  adresse_json: z.object({
    strasse: z.string().max(150).optional(),
    plz: z.string().max(12).optional(),
    ort: z.string().max(100).optional(),
    land: z.string().max(60).optional(),
  }).optional(),
  telefon: z.string().max(40).nullable().optional(),
  mobil: z.string().max(40).nullable().optional(),
  email: z.string().email().optional(),
  linkedin: z.string().max(250).nullable().optional(),
  webseite: z.string().max(250).nullable().optional(),
  ust_id: z.string().max(30).nullable().optional(),
  steuernummer: z.string().max(30).nullable().optional(),
  ort: z.string().max(100).nullable().optional(),
  land: z.string().max(60).nullable().optional(),
  reisebereitschaft: z.string().max(100).nullable().optional(),
  arbeitsmodell: z.enum(['remote', 'hybrid', 'vor_ort']).nullable().optional(),
  sprachen_json: z.array(z.object({ sprache: z.string().max(40), niveau: z.string().max(40) })).optional(),
  status: z.enum(['eingeladen', 'registriert', 'freigegeben', 'inaktiv']).optional(), // nur Admin
});

const rateSchema = z.object({
  kategorie: z.enum(['remote', 'vor_ort', 'interim', 'projektleitung', 'beratung']),
  satz_von_eur: z.number().int().min(1).max(20000),
  satz_bis_eur: z.number().int().min(1).max(20000).nullable().optional(),
  gueltig_ab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const skillSchema = z.object({
  name: z.string().min(2).max(80),
  kategorie: z.enum(['kompetenz', 'technologie', 'rolle', 'branche', 'zertifikat']),
});

async function updateProfile(req, res, expert, { allowStatus }) {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const data = { ...parsed.data };
  if (!allowStatus) delete data.status; // Experten können sich nicht selbst freigeben
  if (data.adresse_json) data.adresse_json = JSON.stringify(data.adresse_json);
  if (data.sprachen_json) data.sprachen_json = JSON.stringify(data.sprachen_json);
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Keine Änderungen übergeben' });

  const oldValues = {};
  for (const k of Object.keys(data)) oldValues[k] = expert[k];
  const [updated] = await db('experts').where({ id: expert.id }).update(data).returning('*');
  await req.audit({
    action: 'expert.update',
    resource: 'experts',
    resourceId: expert.id,
    oldValue: oldValues,
    newValue: data,
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, expert: updated });
}

/** Profil bearbeiten — Experte (eigenes Profil). */
router.put('/me', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  return updateProfile(req, res, expert, { allowStatus: false });
});

/** Profil bearbeiten — Admin. */
router.put('/:id(\\d+)', requireRole('admin'), async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  return updateProfile(req, res, expert, { allowStatus: true });
});

async function addRate(req, res, expert) {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Satzangaben' });
  const d = parsed.data;
  if (d.satz_bis_eur && d.satz_bis_eur < d.satz_von_eur) {
    return res.status(400).json({ error: '„bis"-Satz darf nicht unter dem „von"-Satz liegen' });
  }
  const [rate] = await db('rates')
    .insert({
      tenant_id: expert.tenant_id,
      expert_id: expert.id,
      kategorie: d.kategorie,
      satz_von_eur: d.satz_von_eur,
      satz_bis_eur: d.satz_bis_eur || null,
      gueltig_ab: d.gueltig_ab,
      created_by: req.user.id,
    })
    .returning('*');
  await req.audit({ action: 'rate.add', resource: 'rates', resourceId: rate.id, newValue: d });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, rate });
}

/** Tagessatz erfassen — Experte (Insert-only, Historie bleibt). */
router.post('/me/rates', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  return addRate(req, res, expert);
});

/** Tagessatz erfassen — Admin. */
router.post('/:id(\\d+)/rates', requireRole('admin'), async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  return addRate(req, res, expert);
});

/** Skill hinzufügen — Admin (legt Skill bei Bedarf an). */
router.post('/:id(\\d+)/skills', requireRole('admin'), async (req, res) => {
  const parsed = skillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Skill-Angaben' });
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  let skill = await db('skills').whereRaw('lower(name) = lower(?)', [parsed.data.name]).first();
  if (!skill) [skill] = await db('skills').insert({ name: parsed.data.name, kategorie: parsed.data.kategorie }).returning('*');
  await db('expert_skills').insert({ expert_id: expert.id, skill_id: skill.id }).onConflict(['expert_id', 'skill_id']).ignore();
  await req.audit({ action: 'expert.skill_add', resource: 'experts', resourceId: expert.id, newValue: { skill: skill.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, skill });
});

/** Skill entfernen — Admin. */
router.delete('/:id(\\d+)/skills/:skillId(\\d+)', requireRole('admin'), async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const skill = await db('skills').where({ id: Number(req.params.skillId) }).first();
  await db('expert_skills').where({ expert_id: expert.id, skill_id: Number(req.params.skillId) }).delete();
  await req.audit({ action: 'expert.skill_remove', resource: 'experts', resourceId: expert.id, oldValue: { skill: skill?.name } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
