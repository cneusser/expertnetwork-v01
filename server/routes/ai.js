/**
 * Sprint 9 — KI-Routen.
 * Grundprinzip: Die KI SCHLÄGT VOR, ein Mensch bestätigt. /extract liefert
 * einen Diff-Vorschlag, /apply übernimmt nur explizit ausgewählte Änderungen
 * (auditiert). /explain liefert eine LLM-Begründung zum deterministischen Score.
 * Kostenkontrolle: Tageslimit je Mandant (LLM_DAILY_LIMIT, Default 100),
 * Erklärungen werden im Speicher gecacht.
 */
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getLlmProvider, EXTRACT_PROMPT, EXPLAIN_PROMPT } = require('../providers/llm');
const { computeMatch } = require('../utils/matching');
const { freshness } = require('../utils/freshness');
const storage = require('../providers/storage');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Nur PDF erlaubt'))),
});

const explainCache = new Map(); // key: project:expert → { text, ts }

async function checkDailyLimit(req, res) {
  const limit = Number(process.env.LLM_DAILY_LIMIT) || 100;
  const { c } = await db('audit_log')
    .where('tenant_id', req.user.tenantId)
    .whereIn('action', ['ai.extract', 'ai.explain'])
    .whereRaw(`ts >= date_trunc('day', now())`)
    .count('* as c')
    .first();
  if (Number(c) >= limit) {
    res.status(429).json({ error: `KI-Tageslimit erreicht (${limit}/Tag)` });
    return false;
  }
  return true;
}

async function resolveExpert(req) {
  if (req.user.role === 'expert') return db('experts').where({ user_id: req.user.id }).first();
  if (req.body.expert_id || req.query.expert_id) {
    return db('experts').where({ id: Number(req.body.expert_id || req.query.expert_id), tenant_id: req.user.tenantId }).first();
  }
  return null;
}

/**
 * CV analysieren → Diff-Vorschlag. Quelle: PDF-Upload (wird zugleich als neue
 * CV-Version im Tresor abgelegt) oder cv_text.
 */
router.post('/extract', upload.single('file'), async (req, res) => {
  if (!(await checkDailyLimit(req, res))) return;
  const expert = await resolveExpert(req);
  if (!expert) return res.status(404).json({ error: 'Expertenprofil nicht gefunden' });

  let cvText = String(req.body.cv_text || '');
  if (req.file) {
    const pdfParse = require('pdf-parse');
    try {
      cvText = (await pdfParse(req.file.buffer)).text;
    } catch {
      return res.status(400).json({ error: 'PDF konnte nicht gelesen werden' });
    }
    // Neue CV-Version im Tresor ablegen
    const last = await db('documents').where({ expert_id: expert.id, kategorie: 'cv' }).max('version as v').first();
    const version = (last?.v || 0) + 1;
    const relPath = `experts/${expert.id}/cv-ki-v${version}-${Date.now()}.pdf`;
    await storage.save(relPath, req.file.buffer);
    await db('documents').insert({
      tenant_id: expert.tenant_id,
      expert_id: expert.id,
      kategorie: 'cv',
      filename: req.file.originalname,
      version,
      storage_ref: relPath,
      mimetype: 'application/pdf',
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
    });
  }
  if (cvText.trim().length < 50) return res.status(400).json({ error: 'Zu wenig CV-Text (PDF hochladen oder cv_text übergeben)' });

  let suggestion;
  try {
    suggestion = await getLlmProvider().extract(cvText, { EXTRACT_PROMPT });
  } catch (e) {
    return res.status(502).json({ error: `KI-Extraktion fehlgeschlagen: ${e.message}` });
  }

  // Skill-Mapping gegen kuratierte Taxonomie (case-insensitiv)
  const currentSkillIds = await db('expert_skills').where({ expert_id: expert.id }).pluck('skill_id');
  const currentSkills = currentSkillIds.length ? await db('skills').whereIn('id', currentSkillIds) : [];
  const skillDiff = [];
  for (const s of suggestion.skills || []) {
    if (!s?.name) continue;
    const existing = await db('skills').whereRaw('lower(name) = lower(?)', [s.name]).first();
    const alreadyLinked = existing && currentSkillIds.includes(existing.id);
    skillDiff.push({
      name: existing ? existing.name : s.name,
      kategorie: existing ? existing.kategorie : (s.kategorie || 'kompetenz'),
      status: alreadyLinked ? 'vorhanden' : existing ? 'neu_verknuepfen' : 'neu_in_taxonomie',
    });
  }

  await db('audit_log').insert({
    tenant_id: expert.tenant_id,
    actor_id: req.user.id,
    action: 'ai.extract',
    resource: 'experts',
    resource_id: expert.id,
    new_value_json: JSON.stringify({ skills: skillDiff.length, quelle: req.file ? 'pdf' : 'text' }),
    ip: req.ip,
  });

  res.json({
    expert_id: expert.id,
    suggestion: {
      berufsbezeichnung: { alt: expert.berufsbezeichnung, neu: suggestion.berufsbezeichnung || null },
      kurzprofil: { alt: expert.kurzprofil, neu: suggestion.kurzprofil || null },
      senioritaet: suggestion.senioritaet || null,
      jahre_erfahrung: suggestion.jahre_erfahrung || null,
      projektarten: suggestion.projektarten || [],
      sprachen: suggestion.sprachen || [],
      skills: skillDiff,
    },
    hinweis: 'Nichts wurde geändert — bitte Vorschläge prüfen und selektiv übernehmen.',
  });
});

const applySchema = z.object({
  expert_id: z.number().int().optional(),
  berufsbezeichnung: z.string().max(200).nullable().optional(),
  kurzprofil: z.string().max(3000).nullable().optional(),
  skills: z.array(z.object({ name: z.string().min(2).max(80), kategorie: z.enum(['kompetenz', 'technologie', 'rolle', 'branche', 'zertifikat']) })).max(40).optional(),
});

/** Ausgewählte Vorschläge übernehmen (Mensch bestätigt). */
router.post('/apply', async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Auswahl' });
  const expert = await resolveExpert(req);
  if (!expert) return res.status(404).json({ error: 'Expertenprofil nicht gefunden' });
  if (req.user.role === 'expert' && expert.user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung' });

  const updates = {};
  if (parsed.data.berufsbezeichnung) updates.berufsbezeichnung = parsed.data.berufsbezeichnung;
  if (parsed.data.kurzprofil) updates.kurzprofil = parsed.data.kurzprofil;
  const oldValues = {};
  for (const k of Object.keys(updates)) oldValues[k] = expert[k];
  if (Object.keys(updates).length) await db('experts').where({ id: expert.id }).update(updates);

  const addedSkills = [];
  for (const s of parsed.data.skills || []) {
    let skill = await db('skills').whereRaw('lower(name) = lower(?)', [s.name]).first();
    if (!skill) {
      // Neue Begriffe: Admin sofort freigegeben, Experten-Vorschläge in die Freigabeliste
      const approved = ['admin', 'tenant_owner'].includes(req.user.role);
      [skill] = await db('skills').insert({ name: s.name, kategorie: s.kategorie, is_approved: approved }).returning('*');
    }
    await db('expert_skills').insert({ expert_id: expert.id, skill_id: skill.id }).onConflict(['expert_id', 'skill_id']).ignore();
    addedSkills.push(skill.name);
  }

  await req.audit({
    action: 'ai.apply',
    resource: 'experts',
    resourceId: expert.id,
    oldValue: oldValues,
    newValue: { ...updates, skills_hinzugefuegt: addedSkills },
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: `Übernommen: ${Object.keys(updates).length} Feld(er), ${addedSkills.length} Skill(s).` });
});

/** LLM-Begründung zu einem Matching-Vorschlag (Admin) — Score bleibt deterministisch. */
router.post('/explain/:projectId(\\d+)/:expertId(\\d+)', requireRole('admin'), async (req, res) => {
  const key = `${req.params.projectId}:${req.params.expertId}`;
  const cached = explainCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) return res.json({ text: cached.text, cached: true });
  if (!(await checkDailyLimit(req, res))) return;

  const project = await db('projects').where({ id: Number(req.params.projectId), tenant_id: req.user.tenantId }).first();
  const expert = await db('experts').where({ id: Number(req.params.expertId), tenant_id: req.user.tenantId }).first();
  if (!project || !expert) return res.status(404).json({ error: 'Projekt oder Experte nicht gefunden' });

  const projectSkillIds = await db('project_skills').where({ project_id: project.id }).pluck('skill_id');
  const expertSkillIds = await db('expert_skills').where({ expert_id: expert.id }).pluck('skill_id');
  const skills = expertSkillIds.length ? await db('skills').whereIn('id', expertSkillIds).pluck('name') : [];
  const latestAvail = await db('availabilities').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
  const latestRate = await db('rates').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
  const f = freshness({ availabilityConfirmedAt: latestAvail?.confirmed_at, rateCreatedAt: latestRate?.created_at, cvUploadedAt: null });
  const match = computeMatch({ project, projectSkillIds, expertSkillIds, latestAvail, latestRate, freshnessScore: f.score, nichtBestaetigt: f.nichtBestaetigt });

  let text;
  try {
    text = await getLlmProvider().matchExplain({
      projekt: { name: project.name, beschreibung: project.beschreibung, start: project.start, tagessatz_bis: project.tagessatz_bis_eur },
      experte: { berufsbezeichnung: expert.berufsbezeichnung, kurzprofil: expert.kurzprofil, skills },
      score: match.score,
      breakdown: match.breakdown,
      deterministische_begruendung: match.begruendung,
    }, { EXPLAIN_PROMPT });
  } catch (e) {
    return res.status(502).json({ error: `KI-Begründung fehlgeschlagen: ${e.message}` });
  }
  explainCache.set(key, { text, ts: Date.now() });
  await db('audit_log').insert({
    tenant_id: req.user.tenantId,
    actor_id: req.user.id,
    action: 'ai.explain',
    resource: 'projects',
    resource_id: project.id,
    ip: req.ip,
  });
  res.json({ text, score: match.score });
});

module.exports = router;
