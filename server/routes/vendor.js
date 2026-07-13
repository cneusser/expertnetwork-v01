/**
 * Sprint 8 — Vendor-Portal (Rolle 'vendor'):
 * Kunden reichen Projekte ein (Status 'eingereicht', Freigabe durch Admin)
 * und sehen ausschließlich die je Projekt freigegebenen Expertenprofile —
 * standardmäßig anonymisiert (kein Name, keine Kontaktdaten).
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('vendor'));

// v1.1.0: Vendor-Funktionen erst nach Admin-Freigabe
router.use(async (req, res, next) => {
  const user = await db('users').where({ id: req.user.id }).select('is_approved').first();
  if (!user?.is_approved) return res.status(403).json({ error: 'Ihr Zugang wartet auf die Freigabe durch die Phalanx GmbH.' });
  next();
});

const submitSchema = z.object({
  name: z.string().min(2).max(150),
  beschreibung: z.string().max(5000).nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ende: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ort: z.string().max(100).nullable().optional(),
  arbeitsmodell: z.enum(['remote', 'hybrid', 'vor_ort']).nullable().optional(),
  bewerbungsfrist: z.string().nullable().optional(), // ISO-Datum/Zeit
  auslastung_prozent: z.number().int().min(10).max(100).nullable().optional(),
  remote_anteil: z.number().int().min(0).max(100).nullable().optional(),
  tagessatz_von_eur: z.number().int().positive().nullable().optional(),
  tagessatz_bis_eur: z.number().int().positive().nullable().optional(),
});

router.get('/projects', async (req, res) => {
  const projects = await db('projects')
    .where({ tenant_id: req.user.tenantId, vendor_id: req.user.id })
    .orderBy('created_at', 'desc');
  const out = [];
  for (const p of projects) {
    const releases = await db('project_releases').where({ project_id: p.id }).count('* as c').first();
    out.push({ ...p, budget_eur: undefined, tagessatz_bis_eur: undefined, freigaben: Number(releases.c) });
  }
  res.json({ projects: out });
});

router.post('/projects', async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const branding = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});
  const [project] = await db('projects')
    .insert({
      tenant_id: req.user.tenantId,
      vendor_id: req.user.id,
      created_by: req.user.id,
      status: 'eingereicht',
      referenz: 'PHX-' + require('crypto').randomBytes(2).toString('hex').toUpperCase(),
      gebuehr_modell: branding.gebuehr_modell_default || 'gu_anteil',
      gebuehr_prozent: branding.gebuehr_prozent_default ?? 15,
      ...parsed.data,
    })
    .returning('*');
  await req.audit({ action: 'project.vendor_submit', resource: 'projects', resourceId: project.id, newValue: { name: project.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, project, message: 'Projekt eingereicht — die Phalanx GmbH prüft und meldet sich.' });
});

/** Projekt-Detail mit freigegebenen (ggf. anonymisierten) Profilen. */
router.get('/projects/:id(\\d+)', async (req, res) => {
  const project = await db('projects')
    .where({ id: Number(req.params.id), tenant_id: req.user.tenantId, vendor_id: req.user.id })
    .first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  const releases = await db('project_releases').where({ project_id: project.id });
  const profiles = [];
  for (const r of releases) {
    const e = await db('experts').where({ id: r.expert_id }).first();
    if (!e) continue;
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).select('skills.name', 'skills.kategorie');
    const rate = await db('rates').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    const base = {
      release_id: r.id,
      anonymized: r.anonymized,
      berufsbezeichnung: e.berufsbezeichnung,
      kurzprofil: e.kurzprofil,
      skills,
      arbeitsmodell: e.arbeitsmodell,
      reisebereitschaft: e.reisebereitschaft,
      satz: rate ? `${rate.satz_von_eur}${rate.satz_bis_eur ? `–${rate.satz_bis_eur}` : ''} € / Tag` : null,
    };
    const fav = await db('vendor_favorites').where({ user_id: req.user.id, expert_id: e.id }).first();
    base.favorit = Boolean(fav);
    base.feedback = r.feedback || null;
    profiles.push(
      r.anonymized
        ? { ...base, anzeige_name: `Experte #${e.id}` }
        : { ...base, anzeige_name: `${e.vorname} ${e.nachname}`, firma: e.firma, email: e.email, mobil: e.mobil, linkedin: e.linkedin }
    );
  }
  res.json({ project: { ...project, budget_eur: undefined, tagessatz_bis_eur: undefined }, profiles });
});

/** Favorit auf freigegebenem Profil setzen/entfernen (Merkliste). */
router.post('/favorites/:expertId(\\d+)', async (req, res) => {
  const released = await db('project_releases as r')
    .join('projects as p', 'p.id', 'r.project_id')
    .where('p.vendor_id', req.user.id).andWhere('r.expert_id', Number(req.params.expertId)).first();
  if (!released) return res.status(404).json({ error: 'Profil nicht freigegeben' });
  const existing = await db('vendor_favorites').where({ user_id: req.user.id, expert_id: Number(req.params.expertId) }).first();
  if (existing) {
    await db('vendor_favorites').where({ id: existing.id }).delete();
    return res.json({ ok: true, favorit: false });
  }
  await db('vendor_favorites').insert({ tenant_id: req.user.tenantId, user_id: req.user.id, expert_id: Number(req.params.expertId) });
  res.status(201).json({ ok: true, favorit: true });
});

/** Kundenfeedback zu einem freigegebenen Profil. */
router.put('/projects/:id(\\d+)/releases/:releaseId(\\d+)', async (req, res) => {
  const feedback = String(req.body?.feedback || '');
  if (!['interessant', 'gespraech_angefragt', 'absage'].includes(feedback)) {
    return res.status(400).json({ error: 'Ungültiges Feedback' });
  }
  const project = await db('projects').where({ id: Number(req.params.id), vendor_id: req.user.id }).first();
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const release = await db('project_releases').where({ id: Number(req.params.releaseId), project_id: project.id }).first();
  if (!release) return res.status(404).json({ error: 'Freigabe nicht gefunden' });
  await db('project_releases').where({ id: release.id }).update({ feedback, feedback_at: db.fn.now() });
  await req.audit({ action: 'vendor.feedback', resource: 'project_releases', resourceId: release.id, newValue: { feedback } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
