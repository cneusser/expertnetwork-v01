/**
 * Sprint 5 — Suche (nur Admin).
 * Volltext (FTS, deutsch, Boolean-Syntax) + Facettenfilter + gespeicherte Suchen.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toTsQuery } = require('../utils/boolquery');
const { freshness } = require('../utils/freshness');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Facetten-Grunddaten für die Filter-UI (alle Skills, gruppiert). */
router.get('/meta', async (_req, res) => {
  const skills = await db('skills').where({ is_approved: true }).orderBy('name');
  res.json({ skills });
});

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  let query = db('experts').where({ tenant_id: req.user.tenantId }).whereNot('status', 'inaktiv');

  // Volltext mit Boolean-Syntax
  if (req.query.q) {
    let ts;
    try {
      ts = toTsQuery(String(req.query.q));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (ts) query = query.whereRaw(`search_vector @@ to_tsquery('german', ?)`, [ts]);
  }

  // Skill-Facetten (AND-Logik: Experte muss ALLE gewählten Skills haben)
  const skillIds = String(req.query.skills || '').split(',').filter(Boolean).map(Number);
  for (const sid of skillIds) {
    query = query.whereIn('id', db('expert_skills').select('expert_id').where('skill_id', sid));
  }

  if (req.query.arbeitsmodell) query = query.where('arbeitsmodell', String(req.query.arbeitsmodell));
  if (req.query.ort) query = query.whereILike('ort', `%${req.query.ort}%`);
  if (req.query.sprache) query = query.whereRaw('sprachen_json::text ILIKE ?', [`%${req.query.sprache}%`]);

  // Tagessatz-Range: es existiert ein aktueller Satz, der sich mit [min,max] überschneidet
  const satzMin = Number(req.query.satz_min) || null;
  const satzMax = Number(req.query.satz_max) || null;
  if (satzMin || satzMax) {
    query = query.whereIn('id', function () {
      this.select('expert_id').from('rates');
      if (satzMax) this.where('satz_von_eur', '<=', satzMax);
      if (satzMin) this.whereRaw('COALESCE(satz_bis_eur, satz_von_eur) >= ?', [satzMin]);
    });
  }

  const experts = await query.orderBy('nachname');

  // Anreicherung + Nachfilter (Verfügbarkeit, Ampel) — Pool-Größen erlauben das in JS.
  const results = [];
  for (const e of experts) {
    const avails = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc');
    const latestAvail = avails[0] || null;
    const latestRate = await db('rates').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    const latestCv = await db('documents').where({ expert_id: e.id, kategorie: 'cv' }).orderBy('uploaded_at', 'desc').first();
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).select('skills.id', 'skills.name', 'skills.kategorie');
    const f = freshness({
      availabilityConfirmedAt: latestAvail?.confirmed_at,
      rateCreatedAt: latestRate?.created_at,
      cvUploadedAt: latestCv?.uploaded_at,
    });

    if (req.query.verfuegbar === 'jetzt') {
      const current = avails.find((a) => !a.ab_datum || new Date(a.ab_datum).toISOString().slice(0, 10) <= today) || latestAvail;
      if (!current || !['sofort', 'teilweise'].includes(current.status) || f.nichtBestaetigt) continue;
    }
    if (req.query.verfuegbar === 'ab_datum' && req.query.ab_datum) {
      const ok = avails.some((a) => a.ab_datum && new Date(a.ab_datum).toISOString().slice(0, 10) <= String(req.query.ab_datum) && a.status !== 'ausgebucht');
      if (!ok && (!latestAvail || latestAvail.status === 'ausgebucht')) continue;
    }
    if (req.query.ampel && f.ampel !== req.query.ampel) continue;

    results.push({ ...e, search_vector: undefined, skills, availabilities: avails, latestRate, freshness: f });
  }

  // Facetten-Zählung über die Treffermenge (für die Sidebar)
  const facetCounts = {};
  for (const r of results) for (const s of r.skills) facetCounts[s.id] = (facetCounts[s.id] || 0) + 1;

  res.json({ count: results.length, results, facetCounts });
});

/* -------- Gespeicherte Suchen -------- */

const savedSchema = z.object({ name: z.string().min(1).max(80), params: z.record(z.any()) });

router.get('/saved', async (req, res) => {
  const rows = await db('saved_searches').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
  res.json({ searches: rows });
});

router.post('/saved', async (req, res) => {
  const parsed = savedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Name und Parameter erforderlich' });
  const [row] = await db('saved_searches')
    .insert({
      tenant_id: req.user.tenantId,
      user_id: req.user.id,
      name: parsed.data.name,
      params_json: JSON.stringify(parsed.data.params),
    })
    .returning('*');
  await req.audit({ action: 'search.saved', resource: 'saved_searches', resourceId: row.id, newValue: { name: row.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, search: row });
});

router.delete('/saved/:id(\\d+)', async (req, res) => {
  await db('saved_searches').where({ id: Number(req.params.id), user_id: req.user.id }).delete();
  res.json({ ok: true });
});

module.exports = router;
