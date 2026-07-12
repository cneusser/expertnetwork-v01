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

const submitSchema = z.object({
  name: z.string().min(2).max(150),
  beschreibung: z.string().max(5000).nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ende: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ort: z.string().max(100).nullable().optional(),
  arbeitsmodell: z.enum(['remote', 'hybrid', 'vor_ort']).nullable().optional(),
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
  const [project] = await db('projects')
    .insert({
      tenant_id: req.user.tenantId,
      vendor_id: req.user.id,
      created_by: req.user.id,
      status: 'eingereicht',
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
    profiles.push(
      r.anonymized
        ? { ...base, anzeige_name: `Experte #${e.id}` }
        : { ...base, anzeige_name: `${e.vorname} ${e.nachname}`, firma: e.firma, email: e.email, mobil: e.mobil, linkedin: e.linkedin }
    );
  }
  res.json({ project: { ...project, budget_eur: undefined, tagessatz_bis_eur: undefined }, profiles });
});

module.exports = router;
