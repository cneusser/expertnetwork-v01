/** Sprint 6 — Projekte, Matching-Vorschläge und Bewerbungs-Pipeline. */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeMatch } = require('../utils/matching');
const { freshness } = require('../utils/freshness');

const router = express.Router();
router.use(requireAuth);

const APP_STATUS = ['vorgeschlagen', 'beworben', 'im_gespraech', 'angeboten', 'abgelehnt', 'besetzt'];

const projectSchema = z.object({
  name: z.string().min(2).max(150),
  bewerbungsfrist: z.string().nullable().optional(),
  auslastung_prozent: z.number().int().min(10).max(100).nullable().optional(),
  remote_anteil: z.number().int().min(0).max(100).nullable().optional(),
  tagessatz_von_eur: z.number().int().positive().nullable().optional(),
  gebuehr_modell: z.enum(['gu_anteil', 'erfolg']).nullable().optional(),
  gebuehr_prozent: z.number().int().min(0).max(50).nullable().optional(),
  beschreibung: z.string().max(5000).nullable().optional(),
  budget_eur: z.number().int().positive().nullable().optional(),
  tagessatz_bis_eur: z.number().int().positive().nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ende: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ort: z.string().max(100).nullable().optional(),
  arbeitsmodell: z.enum(['remote', 'hybrid', 'vor_ort']).nullable().optional(),
  status: z.enum(['entwurf', 'eingereicht', 'offen', 'besetzt', 'geschlossen']).optional(),
  skill_ids: z.array(z.number().int()).optional(),
});

async function expertMatchInput(expertId) {
  const [skills, latestAvail, latestRate, latestCv] = await Promise.all([
    db('expert_skills').where({ expert_id: expertId }).pluck('skill_id'),
    db('availabilities').where({ expert_id: expertId }).orderBy('created_at', 'desc').first(),
    db('rates').where({ expert_id: expertId }).orderBy('created_at', 'desc').first(),
    db('documents').where({ expert_id: expertId, kategorie: 'cv' }).orderBy('uploaded_at', 'desc').first(),
  ]);
  const f = freshness({
    availabilityConfirmedAt: latestAvail?.confirmed_at,
    rateCreatedAt: latestRate?.created_at,
    cvUploadedAt: latestCv?.uploaded_at,
  });
  return { expertSkillIds: skills, latestAvail, latestRate, freshnessScore: f.score, nichtBestaetigt: f.nichtBestaetigt };
}

/* ---------------- Experte ---------------- */

/** Offene Projekte für Experten (mit eigenem Bewerbungsstatus). */
router.get('/offen', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const projects = await db('projects').where({ tenant_id: req.user.tenantId, status: 'offen' }).orderBy('start');
  const out = [];
  for (const p of projects) {
    const skills = await db('project_skills').join('skills', 'skills.id', 'project_skills.skill_id')
      .where('project_id', p.id).select('skills.id', 'skills.name');
    const app = await db('applications').where({ project_id: p.id, expert_id: expert.id }).first();
    out.push({ ...p, budget_eur: undefined, skills, application: app ? { status: app.status } : null });
  }
  res.json({ projects: out });
});

/** Bewerbung (Experte). */
router.post('/:id(\\d+)/apply', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId, status: 'offen' }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden oder nicht offen' });
  if (project.bewerbungsfrist && new Date(project.bewerbungsfrist) < new Date()) {
    return res.status(400).json({ error: 'Die Bewerbungsfrist ist abgelaufen.' });
  }
  const nachricht = String(req.body?.nachricht || '').slice(0, 2000);

  const projectSkillIds = await db('project_skills').where({ project_id: project.id }).pluck('skill_id');
  const match = computeMatch({ project, projectSkillIds, ...(await expertMatchInput(expert.id)) });

  const existing = await db('applications').where({ project_id: project.id, expert_id: expert.id }).first();
  if (existing) {
    if (!['vorgeschlagen'].includes(existing.status)) {
      return res.status(409).json({ error: 'Bewerbung existiert bereits' });
    }
    await db('applications').where({ id: existing.id }).update({ status: 'beworben', nachricht, updated_at: db.fn.now() });
  } else {
    await db('applications').insert({
      tenant_id: req.user.tenantId,
      project_id: project.id,
      expert_id: expert.id,
      status: 'beworben',
      matching_score: match.score,
      begruendung: match.begruendung,
      nachricht,
    });
  }
  await req.audit({ action: 'application.apply', resource: 'applications', resourceId: project.id, newValue: { projekt: project.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, message: 'Bewerbung eingegangen — die Phalanx GmbH meldet sich bei Ihnen.' });
});

/** Meine Bewerbungen (Experte) — Historie inkl. Projekt und Frist. */
router.get('/meine-bewerbungen', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const rows = await db('applications as a')
    .join('projects as p', 'p.id', 'a.project_id')
    .where('a.expert_id', expert.id)
    .select('a.id', 'a.status', 'a.created_at', 'a.updated_at', 'p.name', 'p.referenz', 'p.bewerbungsfrist')
    .orderBy('a.created_at', 'desc');
  res.json({ bewerbungen: rows });
});

/** Bewerbung zurückziehen (Experte). */
router.post('/bewerbungen/:appId(\\d+)/zurueckziehen', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const app1 = await db('applications').where({ id: Number(req.params.appId), expert_id: expert.id }).first();
  if (!app1) return res.status(404).json({ error: 'Bewerbung nicht gefunden' });
  if (['besetzt', 'abgelehnt'].includes(app1.status)) return res.status(400).json({ error: 'Nicht mehr zurückziehbar' });
  await db('applications').where({ id: app1.id }).update({ status: 'zurueckgezogen', updated_at: db.fn.now() });
  await req.audit({ action: 'application.withdraw', resource: 'applications', resourceId: app1.id });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Bewerbung zurückgezogen.' });
});

/* ---------------- Admin ---------------- */

router.get('/', requireRole('admin'), async (req, res) => {
  const projects = await db('projects').where({ tenant_id: req.user.tenantId }).orderBy('created_at', 'desc');
  const out = [];
  for (const p of projects) {
    const apps = await db('applications').where({ project_id: p.id });
    out.push({ ...p, bewerbungen: apps.filter((a) => a.status !== 'abgelehnt').length });
  }
  res.json({ projects: out });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { skill_ids = [], ...data } = parsed.data;
  const [project] = await db('projects')
    .insert({
      tenant_id: req.user.tenantId,
      created_by: req.user.id,
      referenz: 'PHX-' + require('crypto').randomBytes(2).toString('hex').toUpperCase(),
      ...data,
    })
    .returning('*');
  for (const sid of skill_ids) {
    await db('project_skills').insert({ project_id: project.id, skill_id: sid }).onConflict(['project_id', 'skill_id']).ignore();
  }
  await req.audit({ action: 'project.create', resource: 'projects', resourceId: project.id, newValue: { name: project.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, project });
});

router.get('/:id(\\d+)', requireRole('admin'), async (req, res) => {
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const skills = await db('project_skills').join('skills', 'skills.id', 'project_skills.skill_id')
    .where('project_id', project.id).select('skills.id', 'skills.name', 'skills.kategorie');
  const projectSkillIds = skills.map((s) => s.id);

  const applications = await db('applications')
    .join('experts', 'experts.id', 'applications.expert_id')
    .where('applications.project_id', project.id)
    .select('applications.*', 'experts.vorname', 'experts.nachname', 'experts.berufsbezeichnung');

  // Matching-Vorschläge: freigegebene Experten ohne Bewerbung, sortiert nach Score
  const appliedIds = applications.map((a) => a.expert_id);
  const blockedIds = await db('blocklist').where({ user_id: req.user.id }).pluck('expert_id');
  const excluded = [...appliedIds, ...blockedIds];
  const candidates = await db('experts')
    .where({ tenant_id: req.user.tenantId, status: 'freigegeben' })
    .whereNotIn('id', excluded.length ? excluded : [0]);
  const matches = [];
  for (const e of candidates) {
    const match = computeMatch({ project, projectSkillIds, ...(await expertMatchInput(e.id)) });
    matches.push({ expert: { id: e.id, vorname: e.vorname, nachname: e.nachname, berufsbezeichnung: e.berufsbezeichnung }, ...match });
  }
  matches.sort((a, b) => b.score - a.score);

  const releases = await db('project_releases').where({ project_id: project.id });
  const vendor = project.vendor_id ? await db('users').where({ id: project.vendor_id }).select('id', 'email').first() : null;
  res.json({ project, skills, applications, matches, releases, vendor });
});

router.put('/:id(\\d+)', requireRole('admin'), async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Angaben' });
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const { skill_ids, ...data } = parsed.data;
  if (Object.keys(data).length) await db('projects').where({ id: project.id }).update(data);
  if (skill_ids) {
    await db('project_skills').where({ project_id: project.id }).delete();
    for (const sid of skill_ids) {
      await db('project_skills').insert({ project_id: project.id, skill_id: sid }).onConflict(['project_id', 'skill_id']).ignore();
    }
  }
  await req.audit({ action: 'project.update', resource: 'projects', resourceId: project.id, oldValue: { status: project.status }, newValue: data });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** Kandidat in die Pipeline aufnehmen (Admin, aus den Matching-Vorschlägen). */
router.post('/:id(\\d+)/applications', requireRole('admin'), async (req, res) => {
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const expert = await db('experts').where({ id: Number(req.body?.expert_id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const projectSkillIds = await db('project_skills').where({ project_id: project.id }).pluck('skill_id');
  const match = computeMatch({ project, projectSkillIds, ...(await expertMatchInput(expert.id)) });
  const [app] = await db('applications')
    .insert({
      tenant_id: req.user.tenantId,
      project_id: project.id,
      expert_id: expert.id,
      status: 'vorgeschlagen',
      matching_score: match.score,
      begruendung: match.begruendung,
    })
    .onConflict(['project_id', 'expert_id'])
    .ignore()
    .returning('*');
  if (!app) return res.status(409).json({ error: 'Bereits in der Pipeline' });
  await req.audit({ action: 'application.propose', resource: 'applications', resourceId: app.id, newValue: { expert: `${expert.vorname} ${expert.nachname}`, score: match.score } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, application: app });
});

/** Profil für den Kunden freigeben (Admin) — Standard: anonymisiert. */
router.post('/:id(\\d+)/releases', requireRole('admin'), async (req, res) => {
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const expert = await db('experts').where({ id: Number(req.body?.expert_id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const anonymized = req.body?.anonymized !== false;
  const [release] = await db('project_releases')
    .insert({
      tenant_id: req.user.tenantId,
      project_id: project.id,
      expert_id: expert.id,
      anonymized,
      released_by: req.user.id,
    })
    .onConflict(['project_id', 'expert_id'])
    .merge({ anonymized })
    .returning('*');
  await req.audit({
    action: 'project.release',
    resource: 'project_releases',
    resourceId: release.id,
    newValue: { expert: `${expert.vorname} ${expert.nachname}`, anonymized },
  });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, release });
});

/** Pipeline-Status ändern (Admin). */
router.put('/:id(\\d+)/applications/:appId(\\d+)', requireRole('admin'), async (req, res) => {
  const status = String(req.body?.status || '');
  if (!APP_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  const app = await db('applications').where({ id: Number(req.params.appId), project_id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!app) return res.status(404).json({ error: 'Bewerbung nicht gefunden' });
  await db('applications').where({ id: app.id }).update({ status, updated_at: db.fn.now() });
  await req.audit({ action: 'application.status', resource: 'applications', resourceId: app.id, oldValue: { status: app.status }, newValue: { status } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** v1.2.0 — Hidden-Links (Admin): erzeugen, auflisten, widerrufen. */
router.get('/:id(\\d+)/share', requireRole('admin'), async (req, res) => {
  const links = await db('share_links').where({ project_id: Number(req.params.id), tenant_id: req.user.tenantId }).orderBy('created_at', 'desc');
  res.json({ links });
});

router.post('/:id(\\d+)/share', requireRole('admin'), async (req, res) => {
  const project = await db('projects').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const tage = Math.min(Math.max(Number(req.body?.gueltig_tage) || 30, 1), 180);
  const token = require('crypto').randomBytes(16).toString('hex');
  const [link] = await db('share_links').insert({
    tenant_id: req.user.tenantId,
    project_id: project.id,
    token,
    expires_at: new Date(Date.now() + tage * 86400000),
    created_by: req.user.id,
  }).returning('*');
  await req.audit({ action: 'share.create', resource: 'share_links', resourceId: link.id, newValue: { projekt: project.referenz, tage } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, link });
});

router.delete('/:id(\\d+)/share/:linkId(\\d+)', requireRole('admin'), async (req, res) => {
  const link = await db('share_links').where({ id: Number(req.params.linkId), project_id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!link) return res.status(404).json({ error: 'Link nicht gefunden' });
  await db('share_links').where({ id: link.id }).update({ revoked_at: db.fn.now() });
  await req.audit({ action: 'share.revoke', resource: 'share_links', resourceId: link.id });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
